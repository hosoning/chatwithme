const WordCards = {
  GLOBAL_KEY: 'tarot_wordcards_v1',
  CONTACT_PREFIX: 'tarot_wordcards_contact_',

  _defaults() {
    return ["嗯", "好的", "在的", "我在想...", "有点累", "开心", "今天很平静", "抱歉", "谢谢你", "没关系的", "我需要一点时间", "继续吧", "恭喜发财", "大吉大利", "小宁！","在公司","知道了","可以","不可以","抱抱","亲亲","爱你",
  "在吃饭","等我","稍后再说","开会中","早点休息","下次补偿你","嘿","你在干嘛",
  "嗯","真乖","😌","晚安","早安","还好","挺忙","不忙","吃了吗",
  "再说","回头聊","忙完找你","去洗澡","等我回家","有点困","没事","……",
  "什么事情","好","嗯。","别闹","行","可以","稍等","收到","嗯哼",
  "小宁！","啊啊啊啊啊啊啊啊啊啊","小宁小宁","李泽言听见了","知道了","可以","不可以","不行","不行不行！！！！",
  "可以吗","贴贴","亲！！！","亲亲","我爱你","我出去了","我去上班了","在家呢",
  "在","不在","在公司","我出去了🥺","在吃饭！","吃了","漂亮～","好好好","🥰🥰🥰","给你爆金币！",
  "魏谦","魏若鹏","女朋友～","华锐","哈哈哈哈哈哈哈","面团","………………","对不起🥺","嗯？","给你做了布丁🥰",
  "给你做了吃的～","开心～～～","不开心🥺","（生气）","（尴尬）","你怎么了吗","怎么了！","（哭）","（哼歌）","🥺好～",
  "（头上小花花）","可以吗？","……………………………………","人好，面团好🥺🥺🥺","听懂了","没懂…………","（点头）","有的","没有","有一点",
  "（思考）","没有……","来了🥺","嗯……好","昂","嗷","洗完澡了～","刚刚一起！","我们一起去～","（皱眉）",
  "🥺🥺🥺亲亲我","（脸红）","（我们这天还能聊下去了么）","在厕所！","在做饭～～～","在吃饭！","在开会🥺","在谈合作…………","在应酬","在车上呢！",
  "送你花花～～～","（委屈巴巴）","猫猫！","想吃饭🥺","可以…那个吗？","想要🥺🥺🥺","嘶…哈………","理理我！","没钱了…………","给你买了东西！！！",
  "我有钱～～～","我家～～～～"];
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
