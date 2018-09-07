import webpack from 'webpack'
import merge from 'webpack-merge'

import common from './common'

const config = {
    bail: true,
    //debug: false,
    profile: false,
    devtool: 'source-map',
    plugins: [
        new webpack.NoErrorsPlugin(),
        new webpack.optimize.OccurrenceOrderPlugin(true),
        new webpack.optimize.DedupePlugin(),
        new webpack.optimize.UglifyJsPlugin({
            compress: {
                warnings: false,
                drop_console: true,
                drop_debugger: true
            },
            output: {
                comments: false
            }
        })
    ],
    module: {
        loaders: []
    }
}

export default merge(common, config)
