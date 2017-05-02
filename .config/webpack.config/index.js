require('babel-register')

const ENV = process.env.NODE_ENV || 'development'
module.exports = require(`./${ENV}`)
