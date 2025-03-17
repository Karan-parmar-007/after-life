// declarations.d.ts
// src/types/declarations.d.ts
declare module 'one-liner-joke' {
      const getRandomJoke: () => { body: string; tags: string[] };
      export { getRandomJoke };
}


declare module 'insults' {
      function random(): string;
      export { random };
}