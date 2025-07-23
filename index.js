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

    // Users Collection (User related APIs)
    const userCollection = database.collection("userCollection");

    app.post("/users/add_new_user", async (req, res) => {
      try {
        const { newUser } = req.body;

        if (!newUser || !newUser.email) {
          return res
            .status(400)
            .send({ status: 400, message: "newUser and email are required!" });
        }

        const existingUser = await userCollection.findOne({
          email: newUser?.email,
        });
        if (existingUser) {
          return res.status(409).send({
            status: 409,
            message: "User with this email already exists!",
          });
        }

        const userResult = await userCollection.insertOne(newUser);
        if (!userResult.insertedId) {
          return res
            .status(500)
            .send({ status: 500, message: "Failed to insert user!" });
        }

        const messageChain = {
          user_email: newUser.email,
          total_count: 0,
          unread_count: 0,
          message_chain: [],
        };
        const messageResult = await messagesCollection.insertOne(messageChain);
        if (!messageResult.insertedId) {
          await userCollection.deleteOne({ _id: userResult.insertedId });
          return res
            .status(500)
            .send({ status: 500, message: "Failed to create message chain!" });
        }

        await userCollection.updateOne(
          { _id: userResult.insertedId },
          { $set: { messageChain_id: messageResult.insertedId.toString() } }
        );

        const notificationChain = {
          user_email: newUser.email,
          total_count: 0,
          unread_count: 0,
          notification_chain: [],
        };
        const notificationResult = await notificationsCollection.insertOne(
          notificationChain
        );
        if (!notificationResult.insertedId) {
          await userCollection.deleteOne({ _id: userResult.insertedId });
          await messagesCollection.deleteOne({ _id: messageResult.insertedId });
          return res.status(500).send({
            status: 500,
            message: "Failed to create notification chain!",
          });
        }

        await userCollection.updateOne(
          { _id: userResult.insertedId },
          {
            $set: {
              notificationChain_id: notificationResult.insertedId.toString(),
            },
          }
        );

        const activityHistoryChain = {
          user_email: newUser.email,
          total_count: 0,
          activityHistory_chain: [],
        };
        const activityHistoryResult =
          await activityHistoriesCollection.insertOne(activityHistoryChain);
        if (!activityHistoryResult.insertedId) {
          await userCollection.deleteOne({ _id: userResult.insertedId });
          await messagesCollection.deleteOne({ _id: messageResult.insertedId });
          await notificationsCollection.deleteOne({
            _id: notificationResult.insertedId,
          });
          return res.status(500).send({
            status: 500,
            message: "Failed to create activity history chain!",
          });
        }

        await userCollection.updateOne(
          { _id: userResult.insertedId },
          {
            $set: {
              activityHistoryChain_id:
                activityHistoryResult.insertedId.toString(),
            },
          }
        );

        return res.send({
          status: 201,
          data: { userId: userResult.insertedId },
          message: "User created successfully.",
        });
      } catch (error) {
        console.error(error);
        if (error.message.includes("already exists")) {
          return res.send({
            status: 409,
            message: "User with this email already exists!",
          });
        }
        return res.send({
          status: 500,
          message: error.message || "Internal Server Error",
        });
      }
    });

    app.post("/users/find_availability_by_email", async (req, res) => {
      const { email } = req.body;
      const query = { email: email };
      const result = await userCollection.findOne(query);
      if (result) {
        res.send({
          status: 409,
          exists: true,
          message: "Registration failed. Email already exists!",
        });
      } else {
        res.send({
          status: 404,
          exists: false,
          message: "Email address not exists!",
        });
      }
    });

    app.post("/users/get_user_by_email", async (req, res) => {
      const { email } = req.body;
      const query = { email: email };
      const result = await userCollection.findOne(query);
      res.send({ status: 200, data: result, message: "Login successful!" });
    });

    app.post(
      "/users/get_full_user_profile_details",
      verifyJWT,
      async (req, res) => {
        try {
          const { userEmail } = req.body;

          if (!userEmail) {
            return res.send({ status: 400, message: "Email is required!" });
          }

          const { decoded_email } = req;
          if (userEmail !== decoded_email) {
            return res.send({
              status: 403,
              message: "Forbidden access, email mismatch!",
            });
          }

          const userQuery = { email: userEmail };
          const userResult = await userCollection.findOne(userQuery);

          if (!userResult) {
            return res.send({ status: 404, message: "User not found!" });
          }

          const { _id, uid, ...filteredUserData } = userResult;

          return res.send({
            status: 200,
            data: filteredUserData,
            message: "Full user details fetched successfully!",
          });
        } catch (error) {
          console.error(error);
          return res.send({ status: 500, message: "Something went wrong!" });
        }
      }
    );

    app.patch(
      "/users/add_or_remove_a_gadget_id_to_or_from_wishlist",
      verifyJWT,
      async (req, res) => {
        try {
          const { userEmail, gadgetId } = req.body;

          if (!userEmail || !gadgetId) {
            return res.status(400).send({
              status: 400,
              message: "userEmail and gadgetId are required!",
            });
          }

          const { decoded_email } = req;
          if (userEmail !== decoded_email) {
            return res.status(403).send({
              status: 403,
              message: "Forbidden access, email mismatch!",
            });
          }

          const query = { email: userEmail };
          const userResult = await userCollection.findOne(query);
          if (!userResult) {
            return res
              .status(404)
              .send({ status: 404, message: "User not found!" });
          }

          const userWishlistArray = userResult.wishlist || [];
          const gadgetExists = userWishlistArray.includes(gadgetId);

          const update = gadgetExists
            ? { $pull: { wishlist: gadgetId } }
            : { $addToSet: { wishlist: gadgetId } };

          const updatedUserResult = await userCollection.updateOne(
            query,
            update
          );
          const postUpdateUserResult = await userCollection.findOne(query);

          if (updatedUserResult.modifiedCount > 0) {
            const message = gadgetExists
              ? "Gadget removed from wishlist successfully!"
              : "Gadget added to wishlist successfully!";
            return res.send({
              status: 200,
              message: message,
              data: postUpdateUserResult.wishlist,
            });
          } else {
            return res.send({
              status: 400,
              message: "No changes made to the wishlist!",
              data: postUpdateUserResult.wishlist,
            });
          }
        } catch (error) {
          console.error(error);
          return res.send({ status: 500, message: "Something went wrong!" });
        }
      }
    );

    // Gadgets related APIs
    const gadgetsCollection = database.collection("gadgetsCollection");

    app.get("/gadgets/featured_gadgets_for_home_page", async (req, res) => {
      try {
        const categories = [
          "Smartphones",
          "Laptops",
          "Tablets",
          "Smartwatches",
          "Cameras",
          "Gaming",
          "Audio",
          "Headphones",
          "Speakers",
          "Wearables",
          "VR",
          "Drones",
          "Projectors",
        ];

        let featuredGadgets = [];

        for (const category of categories) {
          const gadgets = await gadgetsCollection
            .find({ category })
            .sort({ totalRentalCount: -1 })
            .limit(3)
            .toArray();

          const formattedGadgets = gadgets.map((gadget) => ({
            id: gadget?._id.toString(),
            name: gadget?.name,
            category: gadget?.category,
            image: gadget?.images[0],
            pricePerDay: gadget?.pricing?.perDay,
            average_rating: gadget?.average_rating,
            description: gadget?.description,
          }));

          featuredGadgets = featuredGadgets.concat(formattedGadgets);
        }

        return res.send({
          status: 200,
          data: featuredGadgets,
          message: "Featured gadgets, for home page, fetched successfully!",
        });
      } catch (error) {
        console.error(
          "Failed to fetch featured gadgets, for home page! :",
          error
        );
        return res.send({
          status: 500,
          message: "Failed to fetch featured gadgets, for home page!",
        });
      }
    });

    app.get("/gadgets/get_all_gadgets_for_gadgets_page", async (req, res) => {
      try {
        const allGadgetObjects = await gadgetsCollection.find().toArray();

        const formattedGadgets = allGadgetObjects.map((gadget) => ({
          id: gadget?._id.toString(),
          name: gadget?.name,
          category: gadget?.category,
          image: gadget?.images[0],
          average_rating: gadget?.average_rating,
          pricePerDay: gadget?.pricing?.perDay,
          description: gadget?.description,
          popularity: gadget?.totalRentalCount,
        }));

        return res.send({
          status: 200,
          data: formattedGadgets,
          message: "Gadgets, for gadgets page, fetched successfully!",
        });
      } catch (error) {
        console.error("Failed to fetch Gadgets, for gadgets page! :", error);
        return res.send({
          status: 500,
          message: "Failed to fetch Gadgets, for gadgets page!",
        });
      }
    });

    app.get("/gadgets/get_gadget_details_by_id/:id", async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const gadgetResult = await gadgetsCollection.findOne(query);
      if (gadgetResult) {
        res.send({
          status: 200,
          data: gadgetResult,
          message: "Gadget details by id fetched successfully!",
        });
      } else {
        res.send({
          status: 404,
          message: "Failed to fetch Gadget details by id! Gadget not found!",
        });
      }
    });

    app.post(
      "/gadgets/get_gadget_details_of_a_wishlist_array",
      verifyJWT,
      async (req, res) => {
        try {
          const { userEmail } = req.body;

          if (!userEmail) {
            return res
              .status(400)
              .send({ status: 400, message: "userEmail is required!" });
          }

          const { decoded_email } = req;
          if (userEmail !== decoded_email) {
            return res.status(403).send({
              status: 403,
              message: "Forbidden access, email mismatch!",
            });
          }

          const userQuery = { email: userEmail };
          const userResult = await userCollection.findOne(userQuery);
          if (!userResult) {
            return res
              .status(404)
              .send({ status: 404, message: "User not found!" });
          }

          const gadgetIdsArray = userResult.wishlist || [];
          if (gadgetIdsArray.length === 0) {
            return res.send({
              status: 200,
              data: [],
              message: "Wishlist is empty!",
            });
          }

          let gadgetObjectIds;
          try {
            gadgetObjectIds = gadgetIdsArray.map((id) => new ObjectId(id));
          } catch (error) {
            return res.send({
              status: 400,
              message: "Invalid gadget ID format in wishlist!",
            });
          }

          const gadgetQuery = { _id: { $in: gadgetObjectIds } };
          const gadgetObjectsArray = await gadgetsCollection
            .find(gadgetQuery)
            .toArray();

          return res.send({
            status: 200,
            data: gadgetObjectsArray,
            message: "Gadget details of wishlist fetched successfully!",
          });
        } catch (error) {
          console.error(error);
          return res
            .status(500)
            .send({ status: 500, message: "Something went wrong!" });
        }
      }
    );

    // Messages Collection
    const messagesCollection = database.collection("messagesCollection");

    app.post("/messages/get_all_messages_of_a_user", async (req, res) => {
      try {
        const { userEmail } = req.body;

        if (!userEmail) {
          return res
            .status(400)
            .send({ status: 400, message: "User email is missing!" });
        }

        const messageChainQuery = { user_email: userEmail };
        const messageChainResult = await messagesCollection.findOne(
          messageChainQuery
        );

        if (!messageChainResult) {
          return res
            .status(404)
            .send({ status: 404, message: "Message chain not found!" });
        }

        return res.send({
          status: 200,
          data: messageChainResult,
          message: "Messages fetched successfully!",
        });
      } catch (error) {
        console.error("Failed to fetch messages! :", error);
        return res.send({ status: 500, message: "Failed to fetch messages!" });
      }
    });

    const notificationsCollection = database.collection(
      "notificationsCollection"
    );

    const activityHistoriesCollection = database.collection(
      "activityHistoriesCollection"
    );
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
