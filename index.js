const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();
const port = process.env.PORT || 3000;
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

// initializing middlewares
app.use(cors({
    origin: [
        'http://localhost:5173',
        'https://gadgetswap-101.web.app/',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}))
app.use(express.json());
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser());



