const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 3000;
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// initializing middlewares
app.use(
  cors({
    origin: ["http://localhost:5173", "https://gadgetswap-101.web.app/"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// verifying jwt!
const verifyJWT = (req, res, next) => {
  const email = req?.body?.email;
  const token = req?.cookies?.token;

  if (!token) {
    return res.send({
      status: 401,
      message: "No token provided, authorization denied!",
    });
  }

  jwt.verify(token, process.env.ACCESS_JWT_SECRET, (error, decoded) => {
    if (error) {
      return res.send({ status: 402, message: "Invalid or expired token!" });
    }
    req.decoded_email = decoded?.data;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ktxyk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const database = client.db("GadgetSwapApplicationSystemDB");

    // AUTH RELATED APIs
    app.post("/generate_jwt_and_get_token", async (req, res) => {
      const { email } = req.body;

      const token = jwt.sign({ data: email }, process.env.ACCESS_JWT_SECRET, {
        expiresIn: "1h",
      });

      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENVIRONMENT === "production",
          sameSite:
            process.env.NODE_ENVIRONMENT === "production" ? "none" : "Lax",
          maxAge: 3600000,
        })
        .status(201)
        .send({
          token,
          success: true,
          message: "Login Successful, JWT stored in Cookie!",
        });
    });

    app.post("/logout_and_clear_jwt", (req, res) => {
      res
        .clearCookie("token", {
          httpOnly: true,
          secure: process.env.NODE_ENVIRONMENT === "production",
          sameSite:
            process.env.NODE_ENVIRONMENT === "production" ? "none" : "Lax",
          maxAge: 0,
        })
        .status(200)
        .send({ success: true, message: "Logout successful, cookie cleared!" });
    });


  } catch (error) {
    console.error("MongoDB connection error:", error);
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}

app.get("/", (req, res) => {
  res.send("GadgetSwap Server is running...");
});

app.listen(port, () => {
  console.log(`GadgetSwap is listening on port ${port}`);
});
