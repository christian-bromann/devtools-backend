import path from 'path'
import webpack from 'webpack'

const ENV = process.env.NODE_ENV || 'development'
const PATHS = {
    root: path.resolve(__dirname, '..', '..'),
    dist: path.resolve(__dirname, '..', '..', 'build')
}

export { ENV, PATHS }

export default {
    context: path.resolve(__dirname, '..', '..', 'lib'),
    output: {
        path: path.resolve(__dirname, '..', '..', 'build'),
        filename: '[name].js'
    },
    entry: {
        'scripts/debugger': './debugger/debugger.bundle.js'
    },
    resolve: {
        extensions: ['.js', '.es6'],
        alias: {
            driver: path.resolve(__dirname, 'lib/driver')
        }
    },
    cache: true,
    stats: {
        colors: true,
        reasons: true
    },
    module: {
        loaders: [{
            test: /\.js$/,
            exclude: /node_modules/,
            loader: 'babel-loader'
        }]
    },
    // resolve bower components based on the 'main' property
    plugins: [
        new webpack.optimize.LimitChunkCountPlugin({
            maxChunks: 10
        }),
        new webpack.optimize.MinChunkSizePlugin({
            minChunkSize: 20000
        })
    ]
}
