import babel from 'rollup-plugin-babel';

var cache;

export default {
  entry: './src/index.js',
  dest: 'index.js',
  format: 'iife',
  sourceMap: 'inline',
  cache,
  plugins: [
    babel({
      exclude: 'node_modules/**',
    }),
  ],
};