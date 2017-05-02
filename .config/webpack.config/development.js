import merge from 'webpack-merge'

import common from './common'

const config = {
    cache: true,
    module: {
        loaders: []
    }
}

export default merge(common, config)
