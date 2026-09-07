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

    // Le site NUISIKIT est une page unique (pas de vraies pages "/merci" ou "/panier").
    // On revient donc toujours sur la racine du site, avec des paramètres dans l'adresse
    // que le site sait lire pour afficher la confirmation de commande.
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url: `${SITE_URL}/?checkout=success&order=${encodeURIComponent(orderId || "")}`,
      cancel_url: `${SITE_URL}/?checkout=cancel`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Erreur lors de la création de la session Stripe :", err.message);
    res.status(500).json({ error: "Une erreur est survenue lors de la préparation du paiement." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend NUISIKIT démarré sur le port ${PORT}`);
});
