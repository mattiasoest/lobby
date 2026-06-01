import {
  RegExpMatcher,
  TextCensor,
  asteriskCensorStrategy,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity';

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

const censor = new TextCensor().setStrategy(asteriskCensorStrategy());

/** Masks profanity with asterisks (English preset). Safe to call on already-masked text. */
export function maskProfanity(input: string): string {
  if (!input) return input;
  const matches = matcher.getAllMatches(input, true);
  if (matches.length === 0) return input;
  return censor.applyTo(input, matches);
}
