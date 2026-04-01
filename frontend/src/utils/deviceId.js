import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';

const DEVICE_ID_KEY = '@task_manager:device_id';

let cachedDeviceId = null;

/**
 * Returns a stable UUID for this device installation.
 * Generated once on first launch and persisted in AsyncStorage.
 */
export async function getDeviceId() {
  if (cachedDeviceId) return cachedDeviceId;

  try {
    const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (stored) {
      cachedDeviceId = stored;
      return cachedDeviceId;
    }
  } catch { /* fall through to generate */ }

  const newId = uuidv4();
  try {
    await AsyncStorage.setItem(DEVICE_ID_KEY, newId);
  } catch { /* ignore persistence failure; id will regenerate next launch */ }

  cachedDeviceId = newId;
  return cachedDeviceId;
}
