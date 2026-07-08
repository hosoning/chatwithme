const WordCards = {
  STORAGE_KEY: 'tarot_wordcards_v1',

  getAll() {
    const raw = localStorage.getItem(this.STORAGE_KEY);
    return raw ? JSON.parse(raw) : [
      "嗯", "好的", "在的", "我在想...", "有点累", "开心", "今天很平静",
      "抱歉", "谢谢你", "没关系的", "我需要一点时间", "继续吧"
    ];
  },

  save(list) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list));
  },

  add(text) {
    const list = this.getAll();
    if (text && !list.includes(text)) {
      list.push(text);
      this.save(list);
    }
    return list;
  },

  remove(text) {
    const list = this.getAll().filter(t => t !== text);
    this.save(list);
    return list;
  }
};