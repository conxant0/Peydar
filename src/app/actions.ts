'use server';

import { redirect } from 'next/navigation';
import { getDatabase } from '../lib/db.ts';
import { createTopic, deleteTopic, updateTopic, ValidationError, type TopicInput } from '../lib/topics.ts';

export type FormState = { errors?: Partial<Record<keyof TopicInput, string>>; values?: TopicInput; message?: string };

function inputFrom(formData: FormData): TopicInput {
  const value = (name: string) => {
    const field = formData.get(name);
    return typeof field === 'string' ? field : '';
  };
  return {
    name: value('name'),
    question: value('question'),
    description: value('description'),
    interests: value('interests'),
    nonInterests: value('nonInterests'),
  };
}

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
