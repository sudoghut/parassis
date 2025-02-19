import Dexie from "dexie";

export const checkLLMToken = async (db: Dexie): Promise<boolean> => {
  try {
    const tokenStatus = await db.table('statusName')
      .where('name').equals('llmToken')
      .first();
    
    return !!(tokenStatus && tokenStatus.value);
  } catch (error) {
    console.error('Error checking LLM token:', error);
    return false;
  }
};

export const saveLLMToken = async (db: Dexie, provider: string, token: string) => {
  try {
    const tokenData = {
      provider,
      token
    };
    
    await db.table('statusName').put({
      name: 'llmToken',
      value: JSON.stringify(tokenData)
    });
  } catch (error) {
    console.error('Error saving LLM token:', error);
    throw error;
  }
};
