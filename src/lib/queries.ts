import type { Topic } from './topics.ts';

type QueryProfile = Pick<Topic, 'question' | 'description' | 'interests'>;

export function deriveQueries(profile: QueryProfile): string[] {
  const clean = (value: string) => value.replace(/\s+/g, ' ').trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  const unique = (values: string[]) => {
    const seen = new Set<string>();
    return values.filter((value) => {
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const interests = unique(profile.interests.map(clean));
  if (!interests.length) return [];

  const anchor = interests[0];
  const question = clean(profile.question);
  const ending = question.match(/.*\b(?:across|about|for|in|on|with|between|among)\s+([^,;?!]+)$/i)?.[1];
  const questionPhrase = clean(ending && ending.split(' ').length > 1
    ? ending : question.replace(/^(?:how|what|why|when|where|which)\s+(?:can|do|does|did|could|should|would|is|are)\s+/i, ''))
    .split(' ').slice(0, 7).join(' ');
  const descriptionPhrase = clean(clean(profile.description).split(/[,.;!?]/, 1)[0]
    .replace(/^(?:research on|study of)\s+/i, '').split(/\s+/).slice(0, 7).join(' '));

  return unique([
    ...interests.slice(1, 7).map((interest) => `${anchor} ${interest}`),
    questionPhrase && questionPhrase.toLowerCase() !== anchor.toLowerCase() ? `${anchor} ${questionPhrase}` : '',
    descriptionPhrase,
  ]).slice(0, 8);
}
