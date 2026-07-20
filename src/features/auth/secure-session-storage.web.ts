const PREFIX = 'icao.auth.session.';

function browserStorage() {
  return typeof window === 'undefined' ? undefined : window.localStorage;
}

export const secureSessionStorage = {
  async getItem(key: string) {
    return browserStorage()?.getItem(`${PREFIX}${key}`) ?? null;
  },

  async setItem(key: string, value: string) {
    browserStorage()?.setItem(`${PREFIX}${key}`, value);
  },

  async removeItem(key: string) {
    browserStorage()?.removeItem(`${PREFIX}${key}`);
  },
};
