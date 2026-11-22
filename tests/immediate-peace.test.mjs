import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const root = new URL('../anthroprocenia/', import.meta.url);
const sql = await readFile(new URL('data/immediate-peace.sql', root), 'utf8');

test('immediate peace overrides the war-duration gate without changing the peace cooldown', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE GlobalParameters(Name TEXT PRIMARY KEY, Value TEXT NOT NULL);
      INSERT INTO GlobalParameters VALUES ('DIPLOMACY_WAR_MIN_TURNS','10'),
        ('DIPLOMACY_PEACE_MIN_TURNS','10'), ('AI_TURNS_BETWEEN_PEACE_OFFERS','5');`);
    db.exec(sql);
    db.exec(sql);
    assert.deepEqual(db.prepare('SELECT Name, Value FROM GlobalParameters ORDER BY Name').all()
      .map(row => [row.Name, row.Value]), [
      ['AI_TURNS_BETWEEN_PEACE_OFFERS', '5'],
      ['DIPLOMACY_PEACE_MIN_TURNS', '10'],
      ['DIPLOMACY_WAR_MIN_TURNS', '0'],
    ]);
    db.exec("DELETE FROM GlobalParameters WHERE Name = 'DIPLOMACY_WAR_MIN_TURNS'");
    db.exec(sql);
    assert.equal(db.prepare("SELECT Value FROM GlobalParameters WHERE Name = 'DIPLOMACY_WAR_MIN_TURNS'").get().Value, '0');
  } finally {
    db.close();
  }
});

test('immediate peace loads for every age and preserves negotiated acceptance in native advice', async () => {
  const manifest = await readFile(new URL('anthroprocenia.modinfo', root), 'utf8');
  const group = manifest.match(/<ActionGroup id="immediate-peace"[\s\S]*?<\/ActionGroup>/)?.[0];
  assert.ok(group);
  assert.match(group, /scope="game" criteria="always"/);
  assert.match(group, /<UpdateDatabase>\s*<Item>data\/immediate-peace\.sql<\/Item>/);
  assert.match(group, /<UpdateText>\s*<Item>text\/en_us\/ImmediatePeace\.sql<\/Item>/);
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE LocalizedText(Language TEXT, Tag TEXT, Text TEXT, PRIMARY KEY(Language, Tag));');
    const insert = db.prepare('INSERT INTO LocalizedText VALUES (?,?,?)');
    insert.run('en_US', 'LOC_ADVICE_ANTIQUITY_MILITARY_DECLARING_WAR_MESSAGE',
      'War continues for a minimum of 10 turns. After that point, either side can Propose Peace, but the war will not end until an agreement is made.');
    insert.run('en_US', 'LOC_ADVICE_EXPLORATION_MILITARY_PEACE_DEALS_MESSAGE',
      'Peace Deals can be proposed after ten turns of War by either party involved. The receiving Leader can accept or reject.');
    insert.run('fr_FR', 'LOC_ADVICE_EXPLORATION_MILITARY_PEACE_DEALS_MESSAGE', 'unchanged');
    const textSql = await readFile(new URL('text/en_us/ImmediatePeace.sql', root), 'utf8');
    db.exec(textSql);
    db.exec(textSql);
    const rows = db.prepare('SELECT Text FROM LocalizedText WHERE Language = ? ORDER BY Tag').all('en_US');
    assert.match(rows[0].Text, /immediately.*will not end until an agreement is made/);
    assert.match(rows[1].Text, /as soon as War begins.*accept or reject/);
    assert.equal(db.prepare("SELECT Text FROM LocalizedText WHERE Language = 'fr_FR'").get().Text, 'unchanged');
  } finally {
    db.close();
  }
});
