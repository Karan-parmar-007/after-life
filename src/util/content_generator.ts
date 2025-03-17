
// @ts-ignore
import oneLinerJoke from "one-liner-joke";

// @ts-ignore
import { random } from 'insults';

function contentGenerator(category: string, id: string) {
      switch (category) {
            case 'jokes':
                  return oneLinerJoke.getRandomJoke().body
            case 'insults':
                  return random();
            default:
                  return 'generator is having an off day!';
      }
}
// Generate and log the random humor
export default contentGenerator