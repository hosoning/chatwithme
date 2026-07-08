const WordCards = {
  GLOBAL_KEY: 'tarot_wordcards_v1',
  CONTACT_PREFIX: 'tarot_wordcards_contact_',

  getAll() {
    const raw = localStorage.getItem(this.GLOBAL_KEY);
    return raw ? JSON.parse(raw) : [
      "嗯", "好的", "在的", "我在想...", "有点累", "开心", "今天很平静",
      "抱歉", "谢谢你", "没关系的", "我需要一点时间", "继续吧", "恭喜发财", "大吉大利"
    ];
  },
  save(list) { localStorage.setItem(this.GLOBAL_KEY, JSON.stringify(list)); },
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

  // ---- 角色专属字卡 ----
  getContactList(contactId) {
    const raw = localStorage.getItem(this.CONTACT_PREFIX + contactId);
    return raw ? JSON.parse(raw) : [];
  },
  saveContactList(contactId, list) {
    localStorage.setItem(this.CONTACT_PREFIX + contactId, JSON.stringify(list));
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

  // 根据角色设置返回真正要用的字卡池
  getForContact(contact) {
    if (contact && contact.wordCardMode === 'custom') {
      const custom = this.getContactList(contact.id);
      return custom.length ? custom : this.getAll();
    }
    return this.getAll();
  }
};