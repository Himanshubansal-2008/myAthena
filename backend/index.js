const express = require('express')
const path = require('path')

const app = express()

app.get('/', (req,res) => {
    res.send("Route Working")
})

app.listen(3000,() => {
    console.log("Server running")
})