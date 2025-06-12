module.exports = {
  presets: [
    // Compiles modern JavaScript down to ES5
    '@babel/preset-env',
    // Compiles React features
    ['@babel/preset-react', { runtime: 'automatic' }],
  ],
}
