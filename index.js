import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import postRoutes from "./routes/posts.js";
import { register, services, category } from "./controllers/auth.js";
import { createPost } from "./controllers/posts.js";
import { verifyToken } from "./middleware/auth.js";
import User from "./models/User.js";
import Post from "./models/Post.js";
import { users, posts } from "./data/index.js";
import Stripe from "stripe";
import serverless from "serverless-http";
import { getCategories, getServices, getStaffs, placeOrder } from "./controllers/book.js";

const mainRouter = express.Router();

/* CONFIGURATIONS */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config();
const app = express();
app.use(express.json());
app.use(helmet());
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));
app.use(morgan("common"));
app.use(bodyParser.json({ limit: "30mb", extended: true }));
app.use(bodyParser.urlencoded({ limit: "30mb", extended: true }));
app.use(cors());
app.use("/assets", express.static(path.join(__dirname, "public/assets")));

/* FILE STORAGE */
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/assets");
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});
const upload = multer({ storage });

/* ROUTES WITH FILES */
mainRouter.post("/auth/register", register);

mainRouter.post("/auth/services", services);
mainRouter.post("/auth/category", category);
mainRouter.get("/book/getCategories", getCategories);
mainRouter.get("/book/getServices", getServices);
mainRouter.get("/book/getStaffs", getStaffs);
mainRouter.post("/book/placeOrder", placeOrder);

// app.post("/auth/register", upload.single("picture"), register);
mainRouter.post("/posts", verifyToken, upload.single("picture"), createPost);

//Stripe Payment
const stripe = new Stripe(process.env.SERVER_KEY);

const calculateOrderAmount = (items) => {
  return 2000;
};
mainRouter.post('/create-checkout-session', async (req, res) => {
  try {

    const product = await stripe.products.create({
      name: req.body.name,
      description: 'Product Description',
    });

    const price = await stripe.prices.create({
      unit_amount: req.body.price * 100, // Price in cents (e.g., $1500.00 = 150000 cents)
      currency: 'usd',
      product: product.id,
    });

    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price: price.id,
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${req.body.ReturnURL}&successed=true`,
      cancel_url: `${req.body.ReturnURL}&canceled=true`,
    });

    res.send({
      data: {
        url: session.url,
      },
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      error: 'An error occurred while creating the checkout session.',
    });
  }
});
mainRouter.post("/create-payment-intent", async (req, res) => {
  const { items } = req.body;

  const paymentIntent = await stripe.paymentIntents.create({

    amount: calculateOrderAmount(items),
    currency: "usd",

    automatic_payment_methods: {
      enabled: true,
    },
  });

  res.send({
    clientSecret: paymentIntent.client_secret,
  });
});

/* ROUTES */
mainRouter.use("/auth", authRoutes);
mainRouter.use("/users", userRoutes);
mainRouter.use("/posts", postRoutes);

app.use('/api', mainRouter);

/* MONGOOSE SETUP */
const PORT = process.env.SERVER_PORT || 3001;
mongoose
  .connect(process.env.MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    app.listen(PORT, () => console.log(`Server Port: ${PORT}`));

    /* ADD DATA ONE TIME */
    // User.insertMany(users);
    // Post.insertMany(posts);
  })
  .catch((error) => console.log(`${error} did not connect`));
