// server.js — Backend Stripe pour NUISIKIT
// Ce petit serveur reçoit le contenu du panier envoyé par le site,
// et crée une session de paiement Stripe avec la liste complète des produits.

import express from "express";
import cors from "cors";
import Stripe from "stripe";

// La clé secrète Stripe est lue depuis une variable d'environnement,
// jamais écrite en clair ici. Elle sera configurée dans Hostinger.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
// Chaque tranche est définie par son poids maximum (kg) et le tarif correspondant (€).
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

// Calcule les frais de port à partir du poids total du panier (somme des poids
// de chaque kit, multipliés par leur quantité), selon la grille ci-dessus.
// Un kit inconnu (id absent de POIDS_KG) est ignoré dans le calcul du poids,
// par sécurité, plutôt que de faire planter la commande.
function calculerFraisDePort(items) {
  const poidsTotal = items.reduce((total, item) => {
    const poidsUnitaire = POIDS_KG[item.id] || 0;
    return total + poidsUnitaire * (item.qty || 1);
  }, 0);

  const tranche = GRILLE_PORT.find((t) => poidsTotal <= t.max);
  // Au-delà de la plus grosse tranche prévue (25 kg), on applique le tarif maximum
  // plutôt que de laisser la commande sans frais de port.
  return tranche ? tranche.prix : GRILLE_PORT[GRILLE_PORT.length - 1].prix;
}

const app = express();
app.use(cors({ origin: SITE_URL }));
app.use(express.json());

// Route de vérification simple : permet de tester que le serveur tourne
// en visitant juste son adresse dans un navigateur.
app.get("/", (req, res) => {
  res.send("Backend NUISIKIT en ligne.");
});

// Route principale : reçoit le panier et crée la session de paiement.
// Le site enverra ici un tableau d'articles, par exemple :
// [{ nom: "Kit Punaises Légère", prix: 232.0, qty: 1 }, ...]
app.post("/api/create-checkout-session", async (req, res) => {
  try {
    const { items, orderId } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Le panier est vide." });
    }

    // Construction dynamique de la liste des articles pour Stripe.
    // Le prix est converti en centimes (Stripe travaille en plus petite unité monétaire).
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

    // Ajout des frais de port comme ligne à part, calculés selon le poids total du panier.
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

    // Le site NUISIKIT est une page unique (pas de vraies pages "/merci" ou "/panier").
    // On revient donc toujours sur la racine du site, avec des paramètres dans l'adresse
    // que le site sait lire pour afficher la confirmation de commande.
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
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
