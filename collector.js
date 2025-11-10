// collector.js — 링크/제목 정제 추가
import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';

const http = axios.create({
  headers: {
    'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127 Safari/537.36',
    'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language':'ko,en;q=0.9'
  },
  timeout: 20000,
  maxRedirects: 5,
});

const POSITIVE = ['지원','사업','공고','모집','바우처','패키지','창업','보조','R&D'];
const NEGATIVE = ['이용약관','개인정보','사이트맵','공지사항','점검','수정 안내','채용'];

function passTitle(t='') {
  if (!t.trim()) return false;
  if (NEGATIVE.some(k => t.includes(k))) return false;
  if (POSITIVE.some(k => t.includes(k))) return true;
  return t.length >= 8; // 최소 길이
}
function toAbs(base, href='') {
  try {
    if (!href) return '';
    if (/^https?:\/\//i.test(href)) return href;
    const u = new URL(href, base);
    return u.toString();
  } catch { return ''; }
}
function isGoodLink(link='') {
  try {
    const u = new URL(link);
    const p = (u.pathname||'').toLowerCase();
    const q = (u.search||'').toLowerCase();
    const hint = ['detail','view','notice','bbs','board','post','article'];
    const looksDetail = hint.some(h => p.includes(h) || q.includes(h));
    const longPath = p.split('/').filter(Boolean).length >= 2;
    const hasQuery = q.length > 3;
    if (!looksDetail && !(longPath && hasQuery)) return false;
    return true;
  } catch { return false; }
}

async function getKStartup(){
  const base = 'https://www.k-startup.go.kr';
  const url  = base + '/web/contents/bizpbanc-ongoing.do';
  const {data:html} = await http.get(url);
  const $ = cheerio.load(html);
  const out = [];
  const candidates = ['.list_ty1 li','.list-type1 li','.tbl_list tbody tr','ul li'];

  for (const sel of candidates) {
    const $nodes = $(sel);
    if ($nodes.length < 5) continue;
    $nodes.each((_,el)=>{
      const $el = $(el);
      const a = $el.find('a.tit').attr('href') ?? $el.find('a').attr('href') ?? '';
      const link = toAbs(base, a);
      const title = ($el.find('a.tit').text() || $el.find('a').text() || '').trim();
      const agency = ($el.find('.name,.org').text() || '').trim();
      const period = ($el.find('.date,.period').text() || '').trim();

      if (!passTitle(title)) return;
      if (!isGoodLink(link)) return;

      out.push({
        source:'K-Startup',
        title, region: agency || '중앙', target:'청년/예비창업/창업',
        industry:'', budget:'', benefit_type:'지원사업',
        deadline: period, link, summary:'', keywords:''
      });
    });
    break;
  }
  return out;
}

async function getBizInfo(){
  const base = 'https://www.bizinfo.go.kr';
  const url  = base + '/web/lay1/bbs/S1T122C128/AS/74/list.do';
  const {data:html} = await http.get(url);
  const $ = cheerio.load(html);
  const out = [];
  const candidates = ['.table_list tbody tr','.bbsList tbody tr','table tbody tr','ul li'];

  for (const sel of candidates) {
    const $rows = $(sel);
    if ($rows.length < 5) continue;
    $rows.each((_,tr)=>{
      const $tr = $(tr);
      const a = $tr.find('td.td_left a').attr('href') || $tr.find('a').first().attr('href') || '';
      const link = toAbs(base, a);
      const title = ($tr.find('td.td_left a').text() || $tr.find('a').first().text() || '').trim();
      const agency = ($tr.find('td:nth-child(3),.org').text() || '').trim();
      const deadline = ($tr.find('td:nth-child(5),.date').text() || '').trim();

      if (!passTitle(title)) return;
      if (!isGoodLink(link)) return;

      out.push({
        source:'기업마당',
        title, region: agency || '중앙', target:'중소기업/청년',
        industry:'', budget:'', benefit_type:'지원사업',
        deadline, link, summary:'', keywords:''
      });
    });
    break;
  }
  return out;
}

async function run(){
  console.log('🚀 수집 시작');
  const a = await getKStartup();
  const b = await getBizInfo();
  const all = [...a, ...b];
  fs.writeFileSync('policies.json', JSON.stringify(all, null, 2), 'utf8');
  console.log('✅ 저장:', all.length, '건');
}
run();
