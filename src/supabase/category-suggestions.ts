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

const MAX_SUGGESTION_CACHE_SIZE = 100;
const suggestionCache = new Map<string, Promise<Category | null>>();

function suggestionCacheKey(input: CloudCategorySuggestionInput, text: string): string {
  const categories = input.categories
    .map(option => `${option.id}:${option.label}`)
    .sort()
    .join('|');
  return [input.direction, text.toLocaleLowerCase('vi-VN'), categories].join('::');
}

function rememberSuggestion(
  key: string,
  request: Promise<Category | null>,
): Promise<Category | null> {
  if (suggestionCache.size >= MAX_SUGGESTION_CACHE_SIZE) {
    const oldestKey = suggestionCache.keys().next().value;
    if (oldestKey) suggestionCache.delete(oldestKey);
  }
  suggestionCache.set(key, request);
  return request;
}

export async function suggestCloudCategory(
  input: CloudCategorySuggestionInput,
): Promise<Category | null> {
  const text = input.text.trim();
  if (!supabase || !text || input.categories.length === 0) return null;

  const cacheKey = suggestionCacheKey(input, text);
  const cached = suggestionCache.get(cacheKey);
  if (cached) return cached;

  return rememberSuggestion(cacheKey, requestCloudCategory(input, text));
}

async function requestCloudCategory(
  input: CloudCategorySuggestionInput,
  text: string,
): Promise<Category | null> {
  if (!supabase) return null;

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

export function clearCloudCategorySuggestionCacheForTests(): void {
  suggestionCache.clear();
}
