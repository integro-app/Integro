(function (global) {
  "use strict";
  if (global.IntegroSimplePdf) return;
  function ascii(value) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "?"); }
  function esc(value) { return ascii(value).replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)"); }
  function build(title, lines = []) {
    const all=[ascii(title),...lines.map(ascii)]; const pages=[];
    for(let i=0;i<all.length;i+=44) pages.push(all.slice(i,i+44));
    const objects=[null];
    const catalog=objects.push("")-1, pagesObj=objects.push("")-1, font=objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")-1;
    const pageIds=[];
    pages.forEach((pageLines,pageIndex)=>{
      const stream=["BT","/F1 11 Tf","48 790 Td",pageIndex===0?"/F1 15 Tf":"/F1 11 Tf",`(${esc(pageLines[0]||title)}) Tj`,"/F1 10 Tf"];
      pageLines.slice(1).forEach(line=>{stream.push("0 -17 Td",`(${esc(line)}) Tj`);}); stream.push("ET");
      const contentText=stream.join("\n"); const content=objects.push(`<< /Length ${contentText.length} >>\nstream\n${contentText}\nendstream`)-1;
      const page=objects.push(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`)-1; pageIds.push(page);
    });
    objects[catalog]=`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`; objects[pagesObj]=`<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(id=>`${id} 0 R`).join(" ")}] >>`;
    let pdf="%PDF-1.4\n"; const offsets=[0]; for(let i=1;i<objects.length;i++){offsets[i]=pdf.length;pdf+=`${i} 0 obj\n${objects[i]}\nendobj\n`;}
    const xref=pdf.length; pdf+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`; for(let i=1;i<objects.length;i++)pdf+=`${String(offsets[i]).padStart(10,"0")} 00000 n \n`; pdf+=`trailer\n<< /Size ${objects.length} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Blob([pdf],{type:"application/pdf"});
  }
  function download(title, lines, filename="relatorio.pdf") { const blob=build(title,lines); const url=URL.createObjectURL(blob); const a=document.createElement("a");a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
  global.IntegroSimplePdf=Object.freeze({build,download});
})(window);
