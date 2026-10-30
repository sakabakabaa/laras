// Approved replacement of the two introductory presentations for Kegiatan 2.
// Scope is one existing class; response items, attempts and schedules are untouched.
migrate(app => {
  const rows=app.findRecordsByFilter('scheduled_class_activities','class = {:class} && title = {:title}','',2,0,{class:'oxeb6ykx9qlwqiy',title:'Persiapan bahasa · müssen und (nicht) dürfen'});
  if(rows.length===0)return;
  if(rows.length!==1)throw new Error('Expected one Kegiatan 2 activity.');
  const record=rows[0],snapshot=JSON.parse(record.getString('snapshot')||'{}');
  if(!snapshot.lesson||snapshot.lesson.scenes.length!==5)throw new Error('Unexpected Kegiatan 2 lesson structure.');
  snapshot._beforeLessonVideos={steps:snapshot.lesson.steps};
  snapshot.lesson.videos=[
    {id:'beschwerden',title:{de:'Beim Arzt · Beschwerden',id:'Keluhan pasien A, B, dan C'},src:'/media/lessons/beim-arzt/beschwerden.mp4',poster:'/media/lessons/beim-arzt/beschwerden.jpg',duration:'1:02'},
    {id:'modalverben',title:{de:'Müssen, dürfen, nicht dürfen',id:'Harus, boleh, dan tidak boleh'},src:'/media/lessons/beim-arzt/modalverben.mp4',poster:'/media/lessons/beim-arzt/modalverben.jpg',duration:'0:53'},
  ];
  snapshot.lesson.videoNote={de:'„Sie muss husten“ beschreibt hier einen Hustenreiz, keine Anweisung vom Arzt.',id:'Catatan video 1: “Sie muss husten” berarti ia terpaksa batuk karena dorongan batuk, bukan perintah untuk batuk.'};
  snapshot.lesson.steps=[
    {de:'Sehen Sie die beiden Videos der Reihe nach an. Pausieren oder wiederholen Sie bei Bedarf.',id:'Tonton kedua video secara berurutan. Jeda atau putar ulang bila diperlukan.'},
    {de:'Lesen Sie danach die Übersicht zum Satzbau und zu nicht dürfen / nicht müssen. Probieren Sie im letzten Abschnitt die Konjugation aus.',id:'Setelah itu, baca ringkasan susunan kalimat dan perbedaan nicht dürfen / nicht müssen. Coba konjugasi pada bagian terakhir.'},
    ...snapshot.lesson.steps.filter(s=>/^Bezug:/i.test(s.de)),
  ];
  record.set('snapshot',snapshot);app.save(record);
}, app => {
  const rows=app.findRecordsByFilter('scheduled_class_activities','class = {:class} && title = {:title}','',2,0,{class:'oxeb6ykx9qlwqiy',title:'Persiapan bahasa · müssen und (nicht) dürfen'});
  for(const record of rows){
    const snapshot=JSON.parse(record.getString('snapshot')||'{}');
    if(!snapshot._beforeLessonVideos||!snapshot.lesson)continue;
    snapshot.lesson.steps=snapshot._beforeLessonVideos.steps;
    delete snapshot.lesson.videos;delete snapshot.lesson.videoNote;delete snapshot._beforeLessonVideos;
    record.set('snapshot',snapshot);app.save(record);
  }
});
