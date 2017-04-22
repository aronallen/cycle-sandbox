var webpack = require('webpack');
var path = require('path');

var SRC_DIR = path.join(__dirname, 'src');

module.exports = {
  devtool: 'eval',
  entry: {
    main: './src/main.ts',
    app:  './src/app.ts'
  },
  module: {
    loaders: [{
      test: /\.tsx?$/,
      loader: 'awesome-typescript-loader',
      include: SRC_DIR
    }]
  },
  output: {
    path: path.join(__dirname, 'build'),
    publicPath: '/static/',
    filename: "[name].js"

  },
  plugins: [
  ],
  resolve: {
    extensions: ['.jsx', '.js', '.tsx', '.ts']
  }
};
