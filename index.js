const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET);
const app = express();
const port = process.env.PORT || 8080;

const client = new MongoClient(process.env.URI, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});
const menusCollection = client.db("bistroBossDB").collection("menusCollection");
const reviewsCollection = client.db("bistroBossDB").collection("reviewsCollection");
const cartCollection = client.db("bistroBossDB").collection("cartCollection");
const usersCollection = client.db("bistroBossDB").collection("usersCollection");
const paymentsCollection = client.db("bistroBossDB").collection("payments");

// app.use(
//     cors({
//         origin: ["http://localhost:5173"],
//         credentials: true,
//     })
// );
app.use(cors());
app.use(express.json());

// jwt Api
app.post("/jwt", async (req, res) => {
    const user = req.body;
    const token = jwt.sign(user, process.env.SECRET_TOKEN, { expiresIn: "1h" });
    res.send({ token });
});
const verifyToken = async (req, res, next) => {
    if (!req.headers.token) {
        return res.status(401).send({ message: "unauthorized access" });
    }
    const token = req.headers.token.split(" ")[1];

    jwt.verify(token, process.env.SECRET_TOKEN, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: "unauthorized access" });
        }
        req.user = decoded;
        next();
    });
};
const verifyAdmin = async (req, res, next) => {
    const email = req.user.email;
    const query = {
        email: email,
    };
    const user = await usersCollection.findOne(query);
    const isAdmin = user.role === "admin";
    if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
    }
    next();
};

app.get("/", (req, res) => {
    res.send("Server is Running");
});

// Users Api
app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
    const result = await usersCollection.find().toArray();
    res.send(result);
});
app.get("/users/:email", verifyToken, async (req, res) => {
    const email = req.params.email;
    if (email !== req.user.email) {
        return res.status(403).send({ message: "unauthorized access" });
    }
    const query = { email: email };
    const user = await usersCollection.findOne(query);
    let admin = false;
    if (user) {
        admin = user?.role === "admin";
    }
    res.send({ admin });
});

app.post("/users", async (req, res) => {
    const user = req.body;

    console.log(user.email);
    const filter = {
        email: user.email,
    };
    const alreadyHave = await usersCollection.findOne(filter);
    if (alreadyHave) {
        return res.send({ acknowledged: true, InsertedId: null });
    }
    const value = {
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
        lastSignInTime: user.lastSignInTime,
    };
    const options = {
        upsert: true,
    };
    const result = await usersCollection.insertOne(value, options);
    res.send(result);
});
app.delete("/users/:id", async (req, res) => {
    const id = req.params.id;
    const filter = {
        _id: new ObjectId(id),
    };
    const result = await usersCollection.deleteOne(filter);

    res.send(result);
});
app.patch("/users/:id", async (req, res) => {
    const id = req.params.id;
    const query = {
        _id: new ObjectId(id),
    };
    const value = {
        $set: { role: "admin" },
    };
    const result = await usersCollection.updateOne(query, value);
    res.send(result);
});

// Menus Api
app.get("/menus", async (req, res) => {
    const result = await menusCollection.find().toArray();
    res.send(result);
});
app.get("/menus/:id", async (req, res) => {
    const id = req.params.id;
    const filter = {
        _id: new ObjectId(id),
    };
    const result = await menusCollection.findOne(filter);
    res.send(result);
});
app.post("/add-menus", verifyToken, verifyAdmin, async (req, res) => {
    const item = req.body;
    const result = await menusCollection.insertOne(item);
    res.send(result);
});
app.patch("/menus/:id", verifyToken, verifyAdmin, async (req, res) => {
    const id = req.params.id;
    const item = req.body;
    const filter = {
        _id: new ObjectId(id),
    };
    const value = {
        $set: {
            name: item.name,
            price: item.price,
            category: item.category,
            recipe: item.recipe,
        },
    };
    const options = {
        upsert: true,
    };
    const result = await menusCollection.updateOne(filter, value, options);
    res.send(result);
});
app.delete("/menus/:id", verifyToken, verifyAdmin, async (req, res) => {
    const id = req.params.id;
    const filter = {
        _id: new ObjectId(id),
    };
    const result = await menusCollection.deleteOne(filter);
    res.send(result);
});

app.get("/reviews", async (req, res) => {
    const result = await reviewsCollection.find().toArray();
    res.send(result);
});
app.get("/carts", async (req, res) => {
    const email = req.query.email;
    const filter = {
        email: email,
    };
    const result = await cartCollection.find(filter).toArray();
    res.send(result);
});
app.post("/carts", async (req, res) => {
    const item = req.body;
    const result = await cartCollection.insertOne(item);
    res.send(result);
});
app.delete("/carts/:id", async (req, res) => {
    const id = req.params.id;
    const filter = {
        _id: new ObjectId(id),
    };
    const result = await cartCollection.deleteOne(filter);
    res.send(result);
});
app.post("/create-payment-intent", async (req, res) => {
    const { price } = req.body;
    const amount = parseInt(price*100);
    
    const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card'],
    })
    res.send({
        clientSecret: paymentIntent.client_secret
    })
});
app.get('/payments/:email', verifyToken, async(req,res)=>{
    const email =  req.params.email;
    const query = {
        email: email
    }
    if (email !== req.user.email) {
        return res.status(403).send({ message: "unauthorized access" });
    }
    
    const result = await paymentsCollection.find(query).toArray();
    res.send(result)
})
app.post('/payments', async(req,res)=>{
    const payment = req.body;
    const paymentResult = await paymentsCollection.insertOne(payment);
    const query = {
        _id: {
            $in: payment.cartIds.map(id=> new ObjectId(id))
        }
    }
    const deleteResult = await cartCollection.deleteMany(query)
    res.send(deleteResult)
})

app.listen(port, () => {
    console.log("Bistro Boss is sitting on ", port);
});
