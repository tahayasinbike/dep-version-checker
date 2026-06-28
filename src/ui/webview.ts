import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { DepService, depId } from '../core/service';
import { classifyUpdate, compareVersions } from '../core/semver';

function nonce(): string {
  return crypto.randomBytes(16).toString('hex');
}

export class DepWebviewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly service: DepService
  ) {
    service.onDidChange(() => this.postData());
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
    view.webview.html = this.html(view.webview);
    view.webview.onDidReceiveMessage((msg) => this.onMessage(msg));
    view.onDidChangeVisibility(() => {
      if (view.visible) this.postData();
    });
  }

  private async onMessage(msg: any): Promise<void> {
    switch (msg?.type) {
      case 'ready':
        this.postData();
        break;
      case 'refresh':
        vscode.commands.executeCommand('depChecker.refresh');
        break;
      case 'open':
        if (msg.id) {
          const found = this.service.findDependency(msg.id);
          if (found) vscode.commands.executeCommand('depChecker.openInManifest', { dep: found.dep });
        }
        break;
      case 'update':
        if (Array.isArray(msg.items) && msg.items.length > 0) {
          await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `${msg.items.length} paket güncelleniyor` },
            async () => {
              const n = await this.service.updateMany(msg.items);
              vscode.window.showInformationMessage(`${n} bağımlılık güncellendi.`);
            }
          );
        }
        break;
    }
  }

  private postData(): void {
    if (!this.view) return;
    const groups = this.service.getGroups().map((g) => ({
      manifestPath: g.manifestPath,
      relPath: vscode.workspace.asRelativePath(g.manifestPath),
      ecosystemLabel: g.ecosystemLabel,
      dependencies: g.dependencies.map((d) => ({
        id: depId(d),
        name: d.name,
        current: d.current ?? '?',
        latest: d.latest ?? null,
        updateType: d.updateType,
        section: d.section,
        error: d.error ?? null,
        options:
          d.current && d.upgradeable.length
            ? d.versions.map((v) => {
                const cmp = compareVersions(v, d.current!);
                const kind = cmp === 0 ? 'current' : cmp < 0 ? 'down' : classifyUpdate(d.current!, v);
                return { version: v, kind, deprecated: d.deprecated.includes(v) };
              })
            : [],
      })),
    }));
    this.view.webview.postMessage({ type: 'data', scanning: this.service.scanning, groups });
  }

  private html(webview: vscode.Webview): string {
    const n = nonce();
    const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${n}';`;
    return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
:root { --cols: 20px minmax(0,1fr) 86px 150px 50px; }
* { box-sizing: border-box; }
body { margin: 0; padding: 0; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); }
.toolbar { position: sticky; top: 0; z-index: 5; background: var(--vscode-sideBar-background); padding: 10px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 1px 0 var(--vscode-panel-border); }
.colhead { display: grid; grid-template-columns: var(--cols); gap: 8px; margin-top: 2px; padding-top: 7px; border-top: 1px solid var(--vscode-panel-border); font-size: 10px; text-transform: uppercase; letter-spacing: .05em; opacity: .5; }
.colhead .r { text-align: right; }
.row1 { display: flex; gap: 6px; align-items: center; }
.search { flex: 1; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent); padding: 4px 6px; border-radius: 4px; outline: none; }
button { font-family: inherit; font-size: inherit; cursor: pointer; border: none; border-radius: 4px; padding: 5px 10px; }
.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.primary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
.primary:disabled { opacity: .45; cursor: default; }
.ghost { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
.ghost:hover { background: var(--vscode-button-secondaryHoverBackground); }
.selrow { display: flex; align-items: center; gap: 6px; font-size: 11px; opacity: .85; }
.group { margin-top: 2px; }
.ghead { display: flex; align-items: center; gap: 6px; padding: 8px 10px 6px; cursor: pointer; user-select: none; }
.ghead .chev { width: 12px; opacity: .7; font-size: 10px; }
.ghead .title { font-weight: 600; font-size: 12px; }
.ghead .count { margin-left: auto; font-size: 11px; opacity: .65; }
.dep { display: grid; grid-template-columns: var(--cols); align-items: center; gap: 8px; padding: 5px 10px; border-radius: 4px; }
.dep.alt { background: rgba(127,127,127,.04); }
.dep:hover { background: var(--vscode-list-hoverBackground); }
.dep.muted { opacity: .5; }
.name { font-weight: 500; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.name:hover { text-decoration: underline; }
.sub { font-size: 11px; opacity: .75; }
.c-cur { font-size: 12px; opacity: .65; text-align: right; white-space: nowrap; }
.c-cur .arrow { opacity: .45; margin-left: 5px; }
.c-badge { text-align: right; }
select { width: 100%; background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-dropdown-border, var(--vscode-panel-border)); border-radius: 4px; padding: 3px 4px; }
.badge { font-size: 10px; padding: 1px 6px; border-radius: 8px; font-weight: 600; }
.major { background: rgba(244,71,71,.18); color: #f25555; }
.minor { background: rgba(240,180,40,.18); color: #e0a106; }
.patch { background: rgba(70,140,240,.18); color: #4d8de0; }
.none  { background: rgba(70,200,120,.16); color: #46c878; }
.down  { background: rgba(150,150,150,.18); color: #9aa0a6; }
.dep   { background: rgba(255,140,40,.2); color: #ff9d3c; }
.unknown { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
option.opt-dep { color: #ff9d3c; }
option.opt-down { color: #9aa0a6; }
input[type=checkbox] { cursor: pointer; accent-color: var(--vscode-button-background); }
.empty { padding: 24px 16px; text-align: center; opacity: .7; }
.spin { display: inline-block; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<div class="toolbar">
  <div class="row1">
    <input id="search" class="search" placeholder="Paket ara…" />
    <button id="refresh" class="ghost" title="Yeniden tara">⟳</button>
  </div>
  <div class="row1">
    <button id="updateBtn" class="primary" disabled>Seçilenleri Güncelle</button>
    <div class="selrow"><input type="checkbox" id="selAll"><label for="selAll">Tümünü seç</label></div>
  </div>
  <div class="colhead">
    <div></div>
    <div>Paket</div>
    <div class="r">Mevcut</div>
    <div>Hedef sürüm</div>
    <div class="r">Tür</div>
  </div>
</div>
<div id="content"></div>
<script nonce="${n}">
const vscode = acquireVsCodeApi();
let state = { scanning: false, groups: [] };
const collapsed = new Set();
const checked = new Set();
const chosen = new Map();
let filter = '';

const el = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const KIND = {major:'major',minor:'minor',patch:'patch',current:'mevcut',down:'düşük'};
function optLabel(o){ const k = KIND[o.kind]||o.kind; return o.version+' ('+k+(o.deprecated?', deprecated':'')+')'; }
function badgeFor(o, fallback){
  if(!o) return {cls:fallback||'unknown', text:fallback||'?'};
  if(o.deprecated) return {cls:'dep', text:'deprecated'};
  if(o.kind==='current') return {cls:'none', text:'güncel'};
  if(o.kind==='down') return {cls:'down', text:'düşür'};
  return {cls:o.kind, text:o.kind};
}

function isOutdated(d){ return d.options && d.options.length > 0 && !d.error; }
function visibleDeps(g){ return g.dependencies.filter(d => !filter || d.name.toLowerCase().includes(filter)); }

function render() {
  const c = el('content');
  if (state.scanning && state.groups.length === 0) {
    c.innerHTML = '<div class="empty"><span class="spin">⟳</span> Taranıyor…</div>';
    return;
  }
  if (state.groups.length === 0) {
    c.innerHTML = '<div class="empty">Desteklenen bir manifest bulunamadı.<br>(package.json, requirements.txt, pyproject.toml, Cargo.toml, composer.json)</div>';
    return;
  }
  let html = '';
  for (const g of state.groups) {
    const deps = visibleDeps(g);
    if (deps.length === 0) continue;
    const outdated = deps.filter(isOutdated);
    const open = !collapsed.has(g.manifestPath);
    html += '<div class="group">';
    html += '<div class="ghead" data-mf="'+esc(g.manifestPath)+'">'
      + '<span class="chev">'+(open?'▾':'▸')+'</span>'
      + '<input type="checkbox" class="gsel" data-mf="'+esc(g.manifestPath)+'" '+(outdated.length>0 && outdated.every(d=>checked.has(d.id))?'checked':'')+' '+(outdated.length===0?'disabled':'')+'>'
      + '<span class="title">'+esc(g.ecosystemLabel)+' · '+esc(g.relPath)+'</span>'
      + '<span class="count">'+(outdated.length? outdated.length+' güncelleme':'güncel')+'</span>'
      + '</div>';
    if (open) {
      deps.forEach((d, i) => {
        const out = isOutdated(d);
        html += '<div class="dep'+(out?'':' muted')+(i%2?' alt':'')+'">';
        html += '<div>'+(out? '<input type="checkbox" class="dsel" data-id="'+esc(d.id)+'" '+(checked.has(d.id)?'checked':'')+'>':'')+'</div>';
        html += '<div><span class="name" data-id="'+esc(d.id)+'">'+esc(d.name)+'</span>'
          + (d.error? '<div class="sub">'+esc(d.error)+'</div>':'')+'</div>';
        html += '<div class="c-cur">'+esc(d.current)+(out?'<span class="arrow">→</span>':'')+'</div>';
        if (out) {
          const sel = chosen.get(d.id) || d.latest;
          html += '<div><select class="ver" data-id="'+esc(d.id)+'">';
          for (const o of d.options) {
            const oc = o.deprecated ? ' class="opt-dep"' : (o.kind==='down' ? ' class="opt-down"' : '');
            html += '<option value="'+esc(o.version)+'"'+oc+' '+(o.version===sel?'selected':'')+'>'+esc(optLabel(o))+'</option>';
          }
          html += '</select></div>';
          const b = badgeFor(d.options.find(o=>o.version===sel), d.updateType);
          html += '<div class="c-badge"><span class="badge '+b.cls+'">'+esc(b.text)+'</span></div>';
        } else {
          html += '<div></div>';
          html += '<div class="c-badge">'+(d.error?'':'<span class="badge none">güncel</span>')+'</div>';
        }
        html += '</div>';
      });
    }
    html += '</div>';
  }
  c.innerHTML = html || '<div class="empty">Eşleşen paket yok.</div>';
  bind();
  updateBtn();
}

function bind() {
  document.querySelectorAll('.ghead .title, .ghead .chev').forEach(n => n.addEventListener('click', e => {
    const mf = e.target.closest('.ghead').dataset.mf;
    if (collapsed.has(mf)) collapsed.delete(mf); else collapsed.add(mf);
    render();
  }));
  document.querySelectorAll('.dsel').forEach(n => n.addEventListener('change', e => {
    const id = e.target.dataset.id;
    if (e.target.checked) checked.add(id); else checked.delete(id);
    render();
  }));
  document.querySelectorAll('.gsel').forEach(n => n.addEventListener('change', e => {
    const mf = e.target.dataset.mf;
    const g = state.groups.find(x => x.manifestPath === mf);
    const outs = visibleDeps(g).filter(isOutdated);
    if (e.target.checked) outs.forEach(d => checked.add(d.id)); else outs.forEach(d => checked.delete(d.id));
    render();
  }));
  document.querySelectorAll('.ver').forEach(n => n.addEventListener('change', e => {
    chosen.set(e.target.dataset.id, e.target.value);
    render();
  }));
  document.querySelectorAll('.name').forEach(n => n.addEventListener('click', e => {
    vscode.postMessage({ type: 'open', id: e.target.dataset.id });
  }));
}

function allOutdated() {
  const out = [];
  for (const g of state.groups) for (const d of visibleDeps(g)) if (isOutdated(d)) out.push(d);
  return out;
}

function updateBtn() {
  const n = checked.size;
  const btn = el('updateBtn');
  btn.textContent = n > 0 ? 'Seçilenleri Güncelle ('+n+')' : 'Seçilenleri Güncelle';
  btn.disabled = n === 0;
  const outs = allOutdated();
  el('selAll').checked = outs.length > 0 && outs.every(d => checked.has(d.id));
}

el('search').addEventListener('input', e => { filter = e.target.value.trim().toLowerCase(); render(); });
el('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
el('selAll').addEventListener('change', e => {
  const outs = allOutdated();
  if (e.target.checked) outs.forEach(d => checked.add(d.id)); else outs.forEach(d => checked.delete(d.id));
  render();
});
el('updateBtn').addEventListener('click', () => {
  const items = [];
  for (const g of state.groups) for (const d of g.dependencies) {
    if (checked.has(d.id)) items.push({ id: d.id, version: chosen.get(d.id) || d.latest });
  }
  if (items.length) vscode.postMessage({ type: 'update', items });
});

window.addEventListener('message', e => {
  if (e.data?.type === 'data') {
    state = e.data;
    const liveOut = new Set();
    state.groups.forEach(g => g.dependencies.forEach(d => { if (isOutdated(d)) liveOut.add(d.id); }));
    [...checked].forEach(id => { if (!liveOut.has(id)) checked.delete(id); });
    render();
  }
});
vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
  }
}
