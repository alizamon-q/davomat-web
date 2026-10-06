(function(){
  let d=localStorage.getItem('davomat_device_id');
  if(!d){ d=(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random()); localStorage.setItem('davomat_device_id',d); }
  const el=document.getElementById('device_id'); if(el) el.value=d;
})();

const box=document.getElementById('officeBox');
if(box) box.addEventListener('change',e=>{
  if(e.target.checked) document.getElementById('note').value='Ishxonadaman';
});

const form=document.getElementById('attendanceForm');
if(form){
  let sending=false;
  form.addEventListener('submit',e=>{
    if(sending) return;
    e.preventDefault();

    const note=document.getElementById('note');
    const status=document.getElementById('gpsStatus');
    const btn=document.getElementById('confirmAttendance');

    if(!note.value.trim()){
      note.focus();
      return;
    }
    if(!navigator.geolocation){
      status.textContent='Bu qurilmada lokatsiya xizmati qo‘llab-quvvatlanmaydi.';
      status.classList.remove('gps-hidden');
      return;
    }

    btn.disabled=true;
    btn.textContent='⏳ LOKATSIYA ANIQLANMOQDA...';
    status.classList.add('gps-hidden');

    navigator.geolocation.getCurrentPosition(p=>{
      document.getElementById('lat').value=p.coords.latitude;
      document.getElementById('lon').value=p.coords.longitude;
      document.getElementById('accuracy').value=p.coords.accuracy||0;
      sending=true;
      btn.textContent='✓ YUBORILMOQDA...';
      form.submit();
    },err=>{
      btn.disabled=false;
      btn.textContent='✓ MA’LUMOTNI TASDIQLAYMAN';
      status.classList.remove('gps-hidden');
      if(err.code===1) status.textContent='Lokatsiyaga ruxsat berilmadi. Brauzerda Location/GPS ruxsatini yoqing.';
      else if(err.code===2) status.textContent='Lokatsiyani aniqlab bo‘lmadi. GPS yoki internetni tekshiring.';
      else status.textContent='Lokatsiyani olish vaqti tugadi. Yana urinib ko‘ring.';
    },{enableHighAccuracy:true,timeout:15000,maximumAge:0});
  });
}
