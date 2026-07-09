const WordCards = {
  GLOBAL_KEY: 'tarot_wordcards_v1',
  CONTACT_PREFIX: 'tarot_wordcards_contact_',

  _defaults() {
    return ["嗯", "好的", "在的", "我在想...", "有点累", "开心", "今天很平静", "抱歉", "谢谢你", "没关系的", "我需要一点时间", "继续吧", "恭喜发财", "大吉大利"];
  },

  getAll() {
    try {
      const raw = localStorage.getItem(this.GLOBAL_KEY);
      if (!raw) return this._defaults();
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : this._defaults();
    } catch (e) {
      console.error('字卡读取失败，使用默认值', e);
      try { localStorage.removeItem(this.GLOBAL_KEY); } catch(_) {}
      return this._defaults();
    }
  },

  save(list) {
    try { localStorage.setItem(this.GLOBAL_KEY, JSON.stringify(list)); }
    catch (e) { console.error('字卡保存失败', e); }
  },

  add(text) {
    const list = this.getAll();
    if (text && !list.includes(text)) { list.push(text); this.save(list); }
    return list;
  },

  remove(text) {
    const list = this.getAll().filter(t => t !== text);
    this.save(list);
    return list;
  },

  getContactList(contactId) {
    try {
      const raw = localStorage.getItem(this.CONTACT_PREFIX + contactId);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('角色专属字卡读取失败', e);
      try { localStorage.removeItem(this.CONTACT_PREFIX + contactId); } catch(_) {}
      return [];
    }
  },

  saveContactList(contactId, list) {
    try { localStorage.setItem(this.CONTACT_PREFIX + contactId, JSON.stringify(list)); }
    catch (e) { console.error('角色专属字卡保存失败', e); }
  },

  addContactCard(contactId, text) {
    const list = this.getContactList(contactId);
    if (text && !list.includes(text)) { list.push(text); this.saveContactList(contactId, list); }
    return list;
  },

  removeContactCard(contactId, text) {
    const list = this.getContactList(contactId).filter(t => t !== text);
    this.saveContactList(contactId, list);
    return list;
  },

  getForContact(contact) {
    if (contact && contact.wordCardMode === 'custom') {
      const custom = this.getContactList(contact.id);
      return custom.length ? custom : this.getAll();
    }
    return this.getAll();
  }
};
