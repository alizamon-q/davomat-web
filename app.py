import os, sqlite3, hashlib, math, csv, io
from datetime import datetime
from functools import wraps
from flask import Flask, render_template, request, redirect, url_for, session, flash, Response
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
import requests

load_dotenv()
app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'dev-change-me')
DB = os.getenv('DATABASE_PATH', os.path.join(os.path.dirname(__file__), 'davomat.db'))
SHEETS_WEBHOOK = os.getenv('GOOGLE_SHEETS_WEBHOOK', '').strip()
OFFICE_LAT = float(os.getenv('OFFICE_LAT', '39.7193'))
OFFICE_LON = float(os.getenv('OFFICE_LON', '66.9197'))
OFFICE_RADIUS = float(os.getenv('OFFICE_RADIUS_METERS', '250'))


def db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn


def _has_column(conn, table, column):
    return any(r['name'] == column for r in conn.execute(f'PRAGMA table_info({table})').fetchall())


def init_db():
    conn = db(); c = conn.cursor()
    c.executescript('''
    CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      department TEXT,
      position TEXT,
      role TEXT NOT NULL DEFAULT 'employee',
      device_hash TEXT,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS attendance(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      note TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      accuracy REAL,
      sent_at TEXT NOT NULL,
      confirmed_at TEXT,
      status TEXT NOT NULL DEFAULT 'Kutilmoqda',
      admin_note TEXT,
      office_match INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    ''')
    # Existing installations are upgraded automatically.
    if not _has_column(conn, 'attendance', 'admin_note'):
        c.execute('ALTER TABLE attendance ADD COLUMN admin_note TEXT')
    # Old database had confirmed_at NOT NULL and Vaqtida/Kech. SQLite cannot alter it in-place safely,
    # so we keep the column but store empty string until approval and normalize old statuses.
    c.execute("UPDATE attendance SET status='Tasdiqlandi' WHERE status IN ('Vaqtida','Kech')")
    if not c.execute("SELECT 1 FROM users WHERE username='admin'").fetchone():
        c.execute("INSERT INTO users(full_name,username,password_hash,department,position,role) VALUES(?,?,?,?,?,?)",
                  ('Administrator','admin',generate_password_hash('admin123'),'Kadrlar bo‘limi','Administrator','admin'))
    if not c.execute("SELECT 1 FROM users WHERE username='BTB152'").fetchone():
        c.execute("INSERT INTO users(full_name,username,password_hash,department,position,role) VALUES(?,?,?,?,?,?)",
                  ("Qodirov Alizamon Obidjob o‘g‘li",'BTB152',generate_password_hash('123456'),
                   'Qurilish sinov laboratoriyasi va bino-inshootlarni texnik holatini o‘rganish',
                   'Bosh mutaxassis','employee'))
    conn.commit(); conn.close()


def login_required(fn):
    @wraps(fn)
    def wrap(*args, **kwargs):
        if 'uid' not in session: return redirect(url_for('login'))
        return fn(*args, **kwargs)
    return wrap


def admin_required(fn):
    @wraps(fn)
    def wrap(*args, **kwargs):
        if 'uid' not in session or session.get('role') != 'admin': return redirect(url_for('login'))
        return fn(*args, **kwargs)
    return wrap


def distance_m(lat1, lon1, lat2, lon2):
    R=6371000
    p1,p2=math.radians(lat1),math.radians(lat2)
    dp=math.radians(lat2-lat1); dl=math.radians(lon2-lon1)
    a=math.sin(dp/2)**2+math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2*R*math.atan2(math.sqrt(a),math.sqrt(1-a))


def sync_sheet(payload):
    if not SHEETS_WEBHOOK: return False, 'Webhook sozlanmagan'
    try:
        r=requests.post(SHEETS_WEBHOOK,json=payload,timeout=8)
        return r.ok, r.text[:300]
    except Exception as e:
        return False, str(e)


@app.route('/', methods=['GET','POST'])
def login():
    if request.method=='POST':
        username=request.form.get('username','').strip(); password=request.form.get('password','')
        device_id=request.form.get('device_id','').strip()
        conn=db(); u=conn.execute('SELECT * FROM users WHERE username=? AND active=1',(username,)).fetchone()
        if not u or not check_password_hash(u['password_hash'],password):
            conn.close(); flash('Login yoki parol noto‘g‘ri.','danger'); return render_template('login.html')
        if u['role']!='admin':
            if not device_id:
                conn.close(); flash('Qurilma identifikatori olinmadi.','danger'); return render_template('login.html')
            h=hashlib.sha256(device_id.encode()).hexdigest()
            if u['device_hash'] and u['device_hash'] != h:
                conn.close(); flash('Bu login boshqa qurilmaga biriktirilgan. Admin qurilmani qayta biriktirishi kerak.','danger'); return render_template('login.html')
            if not u['device_hash']:
                conn.execute('UPDATE users SET device_hash=? WHERE id=?',(h,u['id'])); conn.commit()
        session.update(uid=u['id'],name=u['full_name'],role=u['role']); conn.close()
        return redirect(url_for('admin_dashboard' if u['role']=='admin' else 'profile'))
    return render_template('login.html')

@app.route('/logout')
def logout(): session.clear(); return redirect(url_for('login'))

@app.route('/profile')
@login_required
def profile():
    conn=db(); u=conn.execute('SELECT * FROM users WHERE id=?',(session['uid'],)).fetchone(); conn.close()
    return render_template('profile.html',u=u)

@app.route('/attendance', methods=['GET','POST'])
@login_required
def attendance():
    if request.method=='POST':
        note=request.form.get('note','').strip(); lat=request.form.get('latitude'); lon=request.form.get('longitude'); acc=request.form.get('accuracy')
        if not note or not lat or not lon:
            flash('Izoh va lokatsiya majburiy. GPS ruxsatini yoqing.','danger'); return redirect(url_for('attendance'))
        now=datetime.now(); latf,lonf=float(lat),float(lon)
        office_match=1 if distance_m(latf,lonf,OFFICE_LAT,OFFICE_LON)<=OFFICE_RADIUS else 0
        conn=db(); u=conn.execute('SELECT * FROM users WHERE id=?',(session['uid'],)).fetchone()
        cur=conn.execute('INSERT INTO attendance(user_id,note,latitude,longitude,accuracy,sent_at,confirmed_at,status,admin_note,office_match) VALUES(?,?,?,?,?,?,?,?,?,?)',
                     (u['id'],note,latf,lonf,float(acc or 0),now.isoformat(timespec='seconds'),'','Kutilmoqda','',office_match))
        record_id=cur.lastrowid
        conn.commit(); conn.close()
        payload={'action':'submit','record_id':record_id,'full_name':u['full_name'],'department':u['department'],'position':u['position'],
                 'note':note,'latitude':latf,'longitude':lonf,'maps_url':f'https://maps.google.com/?q={latf},{lonf}',
                 'sent_at':now.strftime('%d.%m.%Y %H:%M:%S'),'confirmed_at':'','status':'Kutilmoqda','admin_note':'','office_match':bool(office_match)}
        sync_sheet(payload)
        flash('Ma’lumot yuborildi. Admin tasdiqlashi kutilmoqda.','success'); return redirect(url_for('stats'))
    return render_template('attendance.html')

@app.route('/stats')
@login_required
def stats():
    month=request.args.get('month') or datetime.now().strftime('%Y-%m')
    conn=db(); rows=conn.execute("SELECT * FROM attendance WHERE user_id=? AND substr(sent_at,1,7)=? ORDER BY sent_at DESC",(session['uid'],month)).fetchall(); conn.close()
    return render_template('stats.html',rows=rows,month=month)

@app.route('/admin')
@admin_required
def admin_dashboard():
    month=request.args.get('month') or datetime.now().strftime('%Y-%m')
    conn=db()
    users=conn.execute("SELECT * FROM users WHERE role='employee' AND active=1 ORDER BY full_name").fetchall()
    records=conn.execute("SELECT a.*,u.full_name,u.department,u.position FROM attendance a JOIN users u ON u.id=a.user_id WHERE substr(a.sent_at,1,7)=? ORDER BY a.sent_at DESC",(month,)).fetchall()
    summary=[]
    for u in users:
        ur=[r for r in records if r['user_id']==u['id']]
        approved=sum(1 for r in ur if r['status']=='Tasdiqlandi')
        pending=sum(1 for r in ur if r['status']=='Kutilmoqda')
        rejected=sum(1 for r in ur if r['status']=='Rad etildi')
        summary.append({'id':u['id'],'name':u['full_name'],'department':u['department'],'count':len(ur),'approved':approved,'pending':pending,'rejected':rejected})
    no_submission=sum(1 for x in summary if x['count']==0)
    pending_records=sum(1 for r in records if r['status']=='Kutilmoqda')
    approved_records=sum(1 for r in records if r['status']=='Tasdiqlandi')
    rejected_records=sum(1 for r in records if r['status']=='Rad etildi')
    conn.close()
    return render_template('admin.html',month=month,records=records,summary=summary,total=len(users),no_submission=no_submission,
                           pending_records=pending_records,approved_records=approved_records,rejected_records=rejected_records)

@app.route('/admin/attendance/<int:record_id>/decision', methods=['POST'])
@admin_required
def admin_attendance_decision(record_id):
    decision=request.form.get('decision','')
    admin_note=request.form.get('admin_note','').strip()
    if decision not in ('approve','reject'):
        flash('Noto‘g‘ri amal.','danger'); return redirect(url_for('admin_dashboard'))
    status='Tasdiqlandi' if decision=='approve' else 'Rad etildi'
    confirmed_at=datetime.now().isoformat(timespec='seconds')
    conn=db()
    r=conn.execute("SELECT a.*,u.full_name,u.department,u.position FROM attendance a JOIN users u ON u.id=a.user_id WHERE a.id=?",(record_id,)).fetchone()
    if not r:
        conn.close(); flash('Yozuv topilmadi.','danger'); return redirect(url_for('admin_dashboard'))
    conn.execute('UPDATE attendance SET status=?, confirmed_at=?, admin_note=? WHERE id=?',(status,confirmed_at,admin_note,record_id)); conn.commit(); conn.close()
    payload={'action':'update','record_id':record_id,'full_name':r['full_name'],'department':r['department'],'position':r['position'],
             'note':r['note'],'latitude':r['latitude'],'longitude':r['longitude'],
             'maps_url':f"https://maps.google.com/?q={r['latitude']},{r['longitude']}",
             'sent_at':datetime.fromisoformat(r['sent_at']).strftime('%d.%m.%Y %H:%M:%S'),
             'confirmed_at':datetime.fromisoformat(confirmed_at).strftime('%d.%m.%Y %H:%M:%S'),
             'status':status,'admin_note':admin_note,'office_match':bool(r['office_match'])}
    sync_sheet(payload)
    flash('Ma’lumot tasdiqlandi.' if decision=='approve' else 'Ma’lumot rad etildi.','success')
    month=request.form.get('month') or datetime.now().strftime('%Y-%m')
    return redirect(url_for('admin_dashboard',month=month))

@app.route('/admin/users', methods=['GET','POST'])
@admin_required
def admin_users():
    conn=db()
    if request.method=='POST':
        action=request.form.get('action')
        try:
            if action=='add':
                conn.execute('INSERT INTO users(full_name,username,password_hash,department,position,role) VALUES(?,?,?,?,?,?)',
                             (request.form['full_name'],request.form['username'],generate_password_hash(request.form['password']),request.form.get('department',''),request.form.get('position',''),'employee'))
                conn.commit(); flash('Xodim qo‘shildi.','success')
            elif action=='edit':
                user_id=request.form['user_id']; full_name=request.form.get('full_name','').strip(); username=request.form.get('username','').strip()
                department=request.form.get('department','').strip(); position=request.form.get('position','').strip(); password=request.form.get('password','').strip()
                if password:
                    conn.execute('UPDATE users SET full_name=?, username=?, department=?, position=?, password_hash=? WHERE id=? AND role=\'employee\'',
                                 (full_name,username,department,position,generate_password_hash(password),user_id))
                else:
                    conn.execute('UPDATE users SET full_name=?, username=?, department=?, position=? WHERE id=? AND role=\'employee\'',
                                 (full_name,username,department,position,user_id))
                conn.commit(); flash('Xodim ma’lumotlari yangilandi.','success')
            elif action=='reset_device':
                conn.execute('UPDATE users SET device_hash=NULL WHERE id=?',(request.form['user_id'],)); conn.commit(); flash('Qurilma bog‘lanishi tozalandi. Endi xodim yangi telefondan kirishi mumkin.','success')
            elif action=='deactivate':
                conn.execute('UPDATE users SET active=0, device_hash=NULL WHERE id=? AND role=\'employee\'',(request.form['user_id'],)); conn.commit(); flash('Xodim ishdan bo‘shatilgan sifatida faolsizlantirildi. Eski davomat tarixi saqlanadi.','success')
            elif action=='activate':
                conn.execute('UPDATE users SET active=1 WHERE id=? AND role=\'employee\'',(request.form['user_id'],)); conn.commit(); flash('Xodim qayta faollashtirildi.','success')
        except sqlite3.IntegrityError:
            flash('Bu login band. Boshqa login kiriting.','danger')
    users=conn.execute("SELECT * FROM users WHERE role='employee' ORDER BY active DESC, full_name").fetchall(); conn.close()
    return render_template('users.html',users=users)

@app.route('/admin/export.csv')
@admin_required
def export_csv():
    month=request.args.get('month') or datetime.now().strftime('%Y-%m')
    conn=db(); rows=conn.execute("SELECT u.full_name,a.note,a.latitude,a.longitude,a.sent_at,a.confirmed_at,a.status,a.admin_note FROM attendance a JOIN users u ON u.id=a.user_id WHERE substr(a.sent_at,1,7)=? ORDER BY a.sent_at",(month,)).fetchall(); conn.close()
    out=io.StringIO(); w=csv.writer(out); w.writerow(['Xodim ism-familiyasi','Izoh','Lokatsiya','Yuborgan sana','Tasdiqlangan vaqt','Holat','Admin izohi'])
    for r in rows: w.writerow([r['full_name'],r['note'],f"{r['latitude']},{r['longitude']}",r['sent_at'],r['confirmed_at'] or '',r['status'],r['admin_note'] or ''])
    return Response('\ufeff'+out.getvalue(), mimetype='text/csv; charset=utf-8', headers={'Content-Disposition':f'attachment; filename=davomat-{month}.csv'})

init_db()

if __name__=='__main__':
    port = int(os.getenv('PORT', '5000'))
    app.run(host='0.0.0.0', port=port, debug=os.getenv('FLASK_DEBUG') == '1')
