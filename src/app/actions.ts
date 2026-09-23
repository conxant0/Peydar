'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { setSaved } from '../lib/browsing.ts';
import { getDatabase } from '../lib/db.ts';
import { classifyNext } from '../lib/classification.ts';
import { createClassifier, testMode } from '../lib/classifier.ts';
import { discoverPapers } from '../lib/discovery.ts';
import { createSearch } from '../lib/paper-search.ts';
import { createTopic, deleteTopic, inputFrom, updateTopic, ValidationError, type TopicInput } from '../lib/topics.ts';

export type FormState = { errors?: Partial<Record<keyof TopicInput, string>>; values?: TopicInput; message?: string };

export async function createTopicAction(_state: FormState, formData: FormData): Promise<FormState> {
  const values = inputFrom(formData);
  let id: string;
  try {
    id = createTopic(getDatabase(), values).id;
  } catch (error) {
    if (error instanceof ValidationError) return { errors: error.errors, values };
    throw error;
  }
  redirect(`/topics/${id}`);
}

export async function updateTopicAction(id: string, _state: FormState, formData: FormData): Promise<FormState> {
  const values = inputFrom(formData);
  try {
    if (!updateTopic(getDatabase(), id, values)) return { message: 'This topic no longer exists.', values };
  } catch (error) {
    if (error instanceof ValidationError) return { errors: error.errors, values };
    throw error;
  }
  redirect(`/topics/${id}`);
}

export async function deleteTopicAction(id: string, _formData: FormData) {
  deleteTopic(getDatabase(), id);
  redirect('/');
}

export async function discoverAction(id: string, _formData: FormData) {
  if (!await discoverPapers(getDatabase(), id, createSearch())) redirect('/');
  revalidatePath(`/topics/${id}`);
}

export async function classifyNextAction(id: string, exclude: string[]) {
  const skip = Array.isArray(exclude) ? exclude.filter((item): item is string => typeof item === 'string') : [];
  const outcome = await classifyNext(getDatabase(), id, createClassifier(), { exclude: skip, testService: testMode() });
  if (outcome.status !== 'none') revalidatePath(`/topics/${id}`);
  return outcome;
}

export async function saveAction(id: string, paperId: string, saved: boolean, _formData: FormData) {
  setSaved(getDatabase(), id, paperId, saved);
  revalidatePath(`/topics/${id}`);
  revalidatePath('/');
}
