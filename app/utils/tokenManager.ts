import Dexie from "dexie";

export const checkLLMToken = async (db: Dexie): Promise<boolean> => {
  try {
    const tokenStatus = await db.table('statusName')
      .where('element').equals('llmToken')
      .first();
    
    return !!(tokenStatus && tokenStatus.value);
  } catch (error) {
    console.error('Error checking LLM token:', error);
    return false;
  }
};

export const saveLLMToken = async (db: Dexie, provider: string, token: string, language: string) => {
  await db.table('statusName').put({ element: 'llmProvider', value: provider });
  await db.table('statusName').put({ element: 'llmToken', value: token });
  await db.table('statusName').put({ element: 'language', value: language });
};

export const getLLMToken = async (db: Dexie) => {
  const provider = await db.table('statusName').where('element').equals('llmProvider').first();
  const token = await db.table('statusName').where('element').equals('llmToken').first();
  const language = await db.table('statusName').where('element').equals('language').first();
  
  return {
    provider: provider?.value || '',
    token: token?.value || '',
    language: language?.value || 'English'
  };
};
