// server.js — Backend Stripe pour NUISIKIT
// Ce serveur reçoit le contenu du panier envoyé par le site, crée une session
// de paiement Stripe, puis, une fois le paiement confirmé par Stripe (webhook),
// enregistre automatiquement la commande dans un Google Sheet (étiquette + répertoire client).

import express from "express";
import cors from "cors";
import Stripe from "stripe";
import { google } from "googleapis";

// La clé secrète Stripe est lue depuis une variable d'environnement,
// jamais écrite en clair ici. Elle sera configurée dans Hostinger.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Clé utilisée par Stripe pour vérifier que les appels au webhook viennent
// bien de Stripe (et pas d'un tiers malveillant). Fournie par le Dashboard Stripe.
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// L'adresse du site principal (utilisée pour autoriser les requêtes
// et pour rediriger le client après paiement). À adapter si besoin.
const SITE_URL = process.env.SITE_URL || "https://nuisikit.fr";

// Poids réel de chaque kit (en kg), utilisé pour calculer les frais de port.
// La clé correspond à l'id du kit tel qu'envoyé par le site.
const POIDS_KG = {
  "kit-punaises-legere": 3,
  "kit-punaises-moderee": 6,
  "kit-punaises-forte": 8,
  "kit-cafards-legere": 0.25,
  "kit-cafards-moderee": 0.5,
  "kit-cafards-forte": 2,
  "kit-fourmis-legere": 0.25,
  "kit-fourmis-moderee": 0.5,
  "kit-fourmis-forte": 2,
  "kit-souris-5": 2,
  "kit-souris-7": 3,
  "kit-souris-10": 4,
  "kit-rats-3": 3,
  "kit-rats-5": 4,
  "kit-rats-7": 5,
};

// Grille de tarifs Mondial Relay par tranche de poids total du panier.
const GRILLE_PORT = [
  { max: 0.25, prix: 6 },
  { max: 0.5, prix: 8 },
  { max: 1, prix: 10 },
  { max: 2, prix: 11 },
  { max: 5, prix: 14 },
  { max: 10, prix: 25 },
  { max: 15, prix: 32 },
  { max: 25, prix: 43 },
];

function calculerFraisDePort(items) {
  const poidsTotal = items.reduce((total, item) => {
    const poidsUnitaire = POIDS_KG[item.id] || 0;
    return total + poidsUnitaire * (item.qty || 1);
  }, 0);

  const tranche = GRILLE_PORT.find((t) => poidsTotal <= t.max);
  return tranche ? tranche.prix : GRILLE_PORT[GRILLE_PORT.length - 1].prix;
}

/* ---------------------------------------------------------
   Google Sheets — écriture automatique des commandes
--------------------------------------------------------- */

// Les identifiants du compte de service Google sont lus depuis des variables
// d'environnement (jamais écrits en clair ici). Voir SETUP-GOOGLE-SHEETS.md.
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
// Sur Hostinger, les sauts de ligne d'une variable d'environnement sont parfois
// stockés sous forme de "\n" littéral : on les reconvertit en vrais sauts de ligne.
const GOOGLE_PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

function getSheetsClient() {
  const auth = new google.auth.JWT(
    GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    GOOGLE_PRIVATE_KEY,
    ["https://www.googleapis.com/auth/spreadsheets"]
  );
  return google.sheets({ version: "v4", auth });
}

// Ajoute une ligne dans l'onglet "Commandes" du Google Sheet.
// Colonnes : Date | N° commande | Nom | Adresse | Code postal | Ville | Téléphone
//            | Email | Produits | Frais de port | Total | Statut paiement
async function ajouterCommandeAuSheet(commande) {
  if (!GOOGLE_SHEET_ID || !GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
    console.warn("Google Sheets non configuré (variables d'environnement manquantes) — commande non enregistrée dans le Sheet.");
    return;
  }
  try {
    const sheets = getSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: "Commandes!A:L",
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [
          [
            new Date().toLocaleString("fr-FR"),
            commande.orderId || "",
            commande.nom || "",
            commande.adresse || "",
            commande.codePostal || "",
            commande.ville || "",
            commande.telephone || "",
            commande.email || "",
            commande.produits || "",
            commande.fraisDePort ?? "",
            commande.total ?? "",
            "Payée",
          ],
        ],
      },
    });
    console.log(`Commande ${commande.orderId} enregistrée dans Google Sheets.`);
  } catch (err) {
    console.error("Erreur lors de l'écriture dans Google Sheets :", err.message);
  }
}

const app = express();
app.use(cors({ origin: SITE_URL }));

// Route de vérification simple.
app.get("/", (req, res) => {
  res.send("Backend NUISIKIT en ligne.");
});

/* ---------------------------------------------------------
   Webhook Stripe — DOIT être déclaré AVANT express.json(),
   car Stripe a besoin du corps brut de la requête pour vérifier
   la signature de sécurité.
--------------------------------------------------------- */
app.post("/api/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Signature de webhook invalide :", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    try {
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
      const produits = lineItems.data
        .filter((li) => li.description !== "Frais de livraison")
        .map((li) => `${li.quantity} × ${li.description}`)
        .join(" | ");

      await ajouterCommandeAuSheet({
        orderId: session.metadata?.orderId,
        nom: session.metadata?.nom,
        adresse: session.metadata?.adresse,
        codePostal: session.metadata?.codePostal,
        ville: session.metadata?.ville,
        telephone: session.metadata?.telephone,
        email: session.metadata?.email,
        produits,
        fraisDePort: session.metadata?.fraisDePort,
        total: (session.amount_total / 100).toFixed(2),
      });
    } catch (err) {
      console.error("Erreur lors du traitement du webhook checkout.session.completed :", err.message);
    }
  }

  res.json({ received: true });
});

// Le reste des routes utilise du JSON classique.
app.use(express.json());

// Route principale : reçoit le panier + les infos client et crée la session de paiement.
app.post("/api/create-checkout-session", async (req, res) => {
  try {
    const { items, orderId, client } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Le panier est vide." });
    }

    const line_items = items.map((item) => ({
      price_data: {
        currency: "eur",
        product_data: {
          name: item.nom,
        },
        unit_amount: Math.round(item.prix * 100),
      },
      quantity: item.qty || 1,
    }));

    const fraisDePort = calculerFraisDePort(items);
    line_items.push({
      price_data: {
        currency: "eur",
        product_data: {
          name: "Frais de livraison",
        },
        unit_amount: Math.round(fraisDePort * 100),
      },
      quantity: 1,
    });

    // Les infos client sont stockées en "metadata" sur la session Stripe :
    // elles ne servent pas au paiement lui-même, mais permettent au webhook
    // de retrouver qui a commandé quoi une fois le paiement confirmé.
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      metadata: {
        orderId: orderId || "",
        nom: client?.nom || "",
        adresse: client?.adresse || "",
        codePostal: client?.codePostal || "",
        ville: client?.ville || "",
        telephone: client?.telephone || "",
        email: client?.email || "",
        fraisDePort: String(fraisDePort),
      },
      success_url: `${SITE_URL}/?checkout=success&order=${encodeURIComponent(orderId || "")}`,
      cancel_url: `${SITE_URL}/?checkout=cancel`,
    });

    res.json({ url: session.url, fraisDePort });
  } catch (err) {
    console.error("Erreur lors de la création de la session Stripe :", err.message);
    res.status(500).json({ error: "Une erreur est survenue lors de la préparation du paiement." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend NUISIKIT démarré sur le port ${PORT}`);
});
