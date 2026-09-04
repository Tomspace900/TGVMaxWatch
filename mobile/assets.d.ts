/**
 * Les polices entrent dans le programme comme des modules.
 *
 * `expo/tsconfig.base` ne declare pas les binaires, et le tsconfig de ce
 * dossier fixe `"types": []` — volontairement, pour que TypeScript ne remonte
 * pas jusqu'au `@types/node` du collecteur. Sans cette declaration, l'import
 * d'un `.ttf` ne compile pas.
 */
declare module '*.ttf' {
  /** Identifiant d'asset Metro, tel que `useFonts` l'attend. */
  const asset: number;
  export default asset;
}
