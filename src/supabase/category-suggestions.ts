import { supabase } from './client';
import {
  categoryBelongsToDirection,
  type Category,
  type TransactionDirection,
} from '../types';

export interface CloudCategorySuggestionOption {
  id: Category;
  label: string;
}

export interface CloudCategorySuggestionInput {
  text: string;
  direction: TransactionDirection;
  categories: readonly CloudCategorySuggestionOption[];
}

interface SuggestCategoryResponse {
  ok?: boolean;
  category?: unknown;
}

export async function suggestCloudCategory(
  input: CloudCategorySuggestionInput,
): Promise<Category | null> {
  const text = input.text.trim();
  if (!supabase || !text || input.categories.length === 0) return null;

  try {
    const { data: sessionResult, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionResult.session) return null;

    const { data, error } = await supabase.functions.invoke<SuggestCategoryResponse>(
      'suggest-category',
      {
        body: {
          text,
          direction: input.direction,
          categories: input.categories,
        },
      },
    );

    if (error) {
      console.warn('Cloud category suggestion failed', error);
      return null;
    }

    const category = data?.category;
    if (
      typeof category === 'string' &&
      input.categories.some(option => option.id === category) &&
      categoryBelongsToDirection(category as Category, input.direction)
    ) {
      return category as Category;
    }
  } catch (error) {
    console.warn('Cloud category suggestion failed', error);
  }

  return null;
}
