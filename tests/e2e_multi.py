# Prova end-to-end con 3 "dispositivi" (pagine) collegati dal finto PeerJS.
# Uso: avvia un server nella cartella del progetto (python3 -m http.server 8765),
#      poi: python3 tests/e2e_multi.py [cartella-screenshot]
import sys, re
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else 'tests/output'
import os; os.makedirs(OUT, exist_ok=True)
URL = 'http://localhost:8765/index.html'
MOCK = open('tests/mock-peer.js').read()
errors = []

def page(ctx, label, w=390, h=844):
    pg = ctx.new_page()
    pg.set_viewport_size({'width': w, 'height': h})
    pg.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    pg.route('**/peerjs.min.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=MOCK))
    pg.on('pageerror', lambda e: errors.append(f'{label}: {e}'))
    pg.on('console', lambda m: errors.append(f'{label}: {m.text}') if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    return pg

def check(cond, msg):
    print(('ok   ' if cond else 'FAIL ') + msg)
    if not cond: raise SystemExit(1)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(device_scale_factor=1, locale='it-IT')
    host = page(ctx, 'host', 1280, 800)
    host.goto(URL); host.fill('#in-name', 'Marco'); host.click('#btn-create')
    host.wait_for_selector('#screen-lobby:not([hidden])', timeout=5000)
    code = ''.join(host.locator('#room-code .tile').all_inner_texts())
    check(len(code) == 4, f'stanza creata con codice {code}')

    # Un amico entra con il link, un altro scrivendo il codice
    g1 = page(ctx, 'luca'); g1.goto(f'{URL}?stanza={code}')
    check(g1.locator('#in-code').input_value() == code, 'il link precompila il codice')
    g1.fill('#in-name', 'Luca'); g1.click('#btn-join-go')
    g1.wait_for_selector('#screen-lobby:not([hidden])', timeout=5000)
    g2 = page(ctx, 'sara'); g2.goto(URL)
    check('Asso, due e tre' in g2.inner_text('.lede'), 'browser in italiano: interfaccia in italiano')
    g2.click('.lang-switch [data-lang="en"]')
    check('Aces, twos and threes' in g2.inner_text('.lede') and g2.inner_text('#btn-create') == 'Create a room', 'Sara passa all\'inglese dalla pagina iniziale')
    g2.fill('#in-name', 'Sara'); g2.click('#btn-join')
    g2.fill('#in-code', code.lower()); g2.click('#btn-join-go')
    g2.wait_for_selector('#screen-lobby:not([hidden])', timeout=5000)
    host.wait_for_timeout(300)
    names = host.locator('#lobby-players .name').all_inner_texts()
    check(len(names) == 3, f'l\'host vede 3 giocatori: {[n.split()[0] for n in names]}')
    check('Room rules' in g2.inner_text('#screen-lobby') and 'Regole della stanza' in host.inner_text('#screen-lobby'),
          'stessa stanza, lingue diverse: Sara in inglese, Marco in italiano')

    # Codice sbagliato
    bad = page(ctx, 'bad'); bad.goto(URL); bad.click('.lang-switch [data-lang="it"]'); bad.fill('#in-name', 'Ugo'); bad.click('#btn-join')
    bad.fill('#in-code', 'ZZZZ'); bad.click('#btn-join-go'); bad.wait_for_timeout(800)
    check('non trovata' in bad.inner_text('#home-error'), 'codice inesistente: messaggio chiaro')
    bad.close()

    # Solo l'host cambia le regole; gli altri le vedono
    check(g1.locator('#rules-form button[data-set="decks"]').first.is_disabled(), 'gli ospiti non possono cambiare le regole')
    host.click('#rules-form button[data-set="decks"][data-val="2"]'); host.wait_for_timeout(200)
    check(g2.locator('#rules-form button[data-set="decks"][data-val="2"]').get_attribute('aria-pressed') == 'true', 'le regole scelte dall\'host arrivano agli altri')
    check(g1.locator('#btn-start').is_hidden(), 'solo l\'host vede "Distribuisci"')

    host.click('#btn-start')
    for pg in (host, g1, g2): pg.wait_for_selector('#screen-game:not([hidden])', timeout=5000)
    check(True, 'la partita parte su tutti i dispositivi')
    host.wait_for_timeout(1900)

    def state(pg):
        return pg.evaluate('''() => ({ turn: document.querySelector('#status').innerText,
            me: document.querySelector('#me-info').innerText,
            seats: [...document.querySelectorAll('.seat')].map(s => s.innerText.replace(/\\n/g,' ')) })''')

    total = 0
    for pg in (host, g1, g2):
        m = re.search(r'(\d+) (?:carte|carta|cards|card)', state(pg)['me'])
        total += int(m.group(1)) if m else 0
    check(total == 80, f'80 carte distribuite (2 mazzi): {total}')

    # Giochiamo: ognuno tocca il proprio mazzo quando è il suo turno
    pages = {'host': host, 'luca': g1, 'sara': g2}
    plays = 0
    for step in range(260):
        for name, pg in pages.items():
            if pg.locator('#my-deck.ready').count():
                pg.click('#my-deck'); plays += 1
        host.wait_for_timeout(60)
        if plays >= 25 and not getattr(check, 'emoji', False):
            check.emoji = True
            host.screenshot(path=f'{OUT}/multi-host.png'); g1.screenshot(path=f'{OUT}/multi-luca.png')
            # Sfottò da Luca, visto dall'host
            g1.click('#btn-emoji'); g1.click('.phrase-grid button >> nth=0')
            host.wait_for_selector('.bubble', timeout=2000)
            check('Paga!' in host.inner_text('#bubbles'), 'lo sfottò di Luca appare sul telefono dell\'host')
            g2.wait_for_selector('.bubble', timeout=2000)
            check('Pay up!' in g2.inner_text('#bubbles'), 'e a Sara arriva tradotto in inglese: "Pay up!"')
            g2.screenshot(path=f'{OUT}/multi-sara-en.png')
    check(plays > 60, f'si gioca a turno da 3 dispositivi ({plays} carte toccate)')

    # Tutti vedono lo stesso mazzetto
    a = host.inner_text('#pile-count'); c = g2.inner_text('#pile-count')
    check(a == c, f'mazzetto uguale su host e ospiti ({a!r})')

    # Sara chiude la scheda: gioca da sola; poi rientra con il link e riprende il posto
    g2_url = g2.url
    sara_cid = g2.evaluate("sessionStorage.getItem('sc-cid')")
    g2.close(); host.wait_for_timeout(600)
    seats = ' | '.join(state(host)['seats'])
    check('gioca da solo' in seats or 'in camicia' in seats, f'Sara disconnessa gioca in automatico: {seats}')
    g2 = ctx.new_page(); g2.set_viewport_size({'width': 390, 'height': 844})
    g2.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    g2.route('**/peerjs.min.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=MOCK))
    # Sui telefoni veri ognuno ha la sua memoria; qui le pagine la condividono, quindi la reimposto per Sara.
    g2.add_init_script(f"sessionStorage.setItem('sc-cid','{sara_cid}'); sessionStorage.setItem('sc-joined','{code}'); localStorage.setItem('sc-prefs', JSON.stringify({{name:'Sara', lang:'en'}}))")
    g2.goto(g2_url)
    g2.wait_for_selector('#screen-game:not([hidden])', timeout=6000)
    host.wait_for_timeout(500)
    check('gioca da solo' not in ' | '.join(state(host)['seats']), 'Sara ricarica la pagina e riprende il suo posto')
    pages['sara'] = g2

    # Schiaffo: forzo una doppia in cima e faccio battere Luca dal suo telefono
    host.evaluate('''() => { const r = window.__scSession.room, g = r.game;
        g.pile.push({ id: 'x1', s: 'C', r: 7 }, { id: 'x2', s: 'S', r: 7 }); r.broadcastState([]); }''')
    host.wait_for_timeout(300)
    before = int(re.search(r'(\d+)', state(g1)['me']).group(1))
    g1.click('#btn-slap')
    host.wait_for_timeout(700)
    check('Schiaffo' in host.inner_text('#status'), 'lo schiaffo di Luca arriva all\'host: ' + host.inner_text('#status'))
    after = int(re.search(r'(\d+)', state(g1)['me']).group(1))
    check(after > before + 1, f'Luca prende il mazzetto ({before} -> {after} carte)')
    g1.screenshot(path=f'{OUT}/multi-luca-2.png')
    # Schiaffo a vuoto da Sara: paga una carta
    host.wait_for_timeout(1300)
    host.evaluate('''() => { const r = window.__scSession.room, g = r.game;
        g.pile.push({ id: 'y1', s: 'C', r: 5 }, { id: 'y2', s: 'S', r: 6 }); r.broadcastState([]); }''')
    host.wait_for_timeout(300)
    me2 = state(g2)['me']
    check(not re.search(r'carte|carta', me2), f'Sara rientrata vede ancora l\'inglese: {me2!r}')
    if re.search(r'\d', me2):
        before = int(re.search(r'(\d+)', state(g2)['me']).group(1))
        g2.click('#btn-slap'); host.wait_for_timeout(700)
        after = int(re.search(r'(\d+)', state(g2)['me']).group(1))
        check(after == before - 1, f'schiaffo a vuoto: Sara paga una carta ({before} -> {after})')

    # L'host chiude la stanza: gli ospiti tornano all'inizio con un messaggio
    host.click('.game-top [data-open="menu"]'); host.click('#sheet [data-act="leave"]'); host.click('#btn-really-leave')
    g1.wait_for_selector('#screen-home:not([hidden])', timeout=4000)
    check('chiusa' in g1.inner_text('#home-error'), 'quando l\'host chiude, gli altri vengono avvisati')
    g2.wait_for_selector('#screen-home:not([hidden])', timeout=4000)
    check('closed' in g2.inner_text('#home-error'), 'Sara riceve l\'avviso in inglese: ' + g2.inner_text('#home-error'))
    b.close()

real = [e for e in errors if 'ERR_FAILED' not in e]
print('errori in console:', real or 'nessuno')
