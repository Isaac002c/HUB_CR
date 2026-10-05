import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default defineConfig([
  ...nextVitals,
  {
    // O projeto mantém React 18 sem React Compiler. As regras abaixo pertencem
    // ao conjunto de validações do Compiler e classificam padrões legados válidos
    // (fetch em effects e refs de cache) como erro. Reavaliar ao ativar o Compiler.
    rules: {
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  globalIgnores(['.next/**', 'node_modules/**', 'backend/**']),
]);
