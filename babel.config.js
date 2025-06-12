module.exports = {
  presets: [
    '@babel/preset-env',
    ['@babel/preset-react', { runtime: 'automatic' }],
  ],
  env: {
    minify: {
      presets: ['babel-preset-minify'],
    },
  },
}
