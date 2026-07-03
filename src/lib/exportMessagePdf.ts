 import jsPDF from 'jspdf';
 import { format } from 'date-fns';
 
 export function exportMessageAsPdf(
   content: string,
   timestamp: string | Date,
   botName: string = 'BeeBot'
 ) {
   const doc = new jsPDF();
   
   // Header styling
   doc.setFontSize(18);
   doc.setTextColor(100, 100, 100);
   doc.text(`${botName} Response`, 20, 20);
   
   // Timestamp
   doc.setFontSize(10);
   doc.setTextColor(150, 150, 150);
   const formattedTime = typeof timestamp === 'string' 
     ? format(new Date(timestamp), 'PPpp')
     : format(timestamp, 'PPpp');
   doc.text(`Generated: ${formattedTime}`, 20, 28);
   
   // Divider line
   doc.setDrawColor(200, 200, 200);
   doc.line(20, 32, 190, 32);
   
   // Content - strip markdown for cleaner PDF
   const cleanContent = content
     .replace(/#{1,6}\s/g, '') // Remove headers
     .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
     .replace(/\*([^*]+)\*/g, '$1') // Remove italic
     .replace(/`{3}[\s\S]*?`{3}/g, '[Code Block]') // Replace code blocks
     .replace(/`([^`]+)`/g, '$1') // Remove inline code
     .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links, keep text
     .trim();
   
   // Split content for pagination
   doc.setFontSize(11);
   doc.setTextColor(40, 40, 40);
   const lines = doc.splitTextToSize(cleanContent, 170);
   
   let y = 40;
   const pageHeight = doc.internal.pageSize.height;
   const marginBottom = 20;
   const lineHeight = 6;
   
   for (const line of lines) {
     if (y > pageHeight - marginBottom) {
       doc.addPage();
       y = 20;
     }
     doc.text(line, 20, y);
     y += lineHeight;
   }
   
   // Footer
   const pageCount = doc.getNumberOfPages();
   for (let i = 1; i <= pageCount; i++) {
     doc.setPage(i);
     doc.setFontSize(8);
     doc.setTextColor(180, 180, 180);
     doc.text(
       `Page ${i} of ${pageCount} • Exported from ${botName}`,
       105,
       pageHeight - 10,
       { align: 'center' }
     );
   }
   
   // Generate filename with timestamp
   const fileTimestamp = format(new Date(), 'yyyyMMdd-HHmmss');
   doc.save(`${botName.toLowerCase()}-response-${fileTimestamp}.pdf`);
 }