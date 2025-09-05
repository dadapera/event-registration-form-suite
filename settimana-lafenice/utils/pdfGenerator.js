const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Generate PDF from registration data using PDFKit with room grouping
 * This replaces html-pdf-node which had Puppeteer/Chrome dependencies
 */
async function generateRegistrationPDF(registrationData, eventName) {
    return new Promise((resolve, reject) => {
        try {
            // Create a new PDF document
            const doc = new PDFDocument({
                margin: 50,
                size: 'A4'
            });

            // Create a buffer to collect PDF data
            const chunks = [];
            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            // Header with logos
            try {
                const logoPath = path.join(__dirname, '..', 'assets', 'mae-logo.png');
                const lafeniceLogoPath = path.join(__dirname, '..', 'assets', 'lafenice-logo.jpg');
                
                if (fs.existsSync(logoPath) && fs.existsSync(lafeniceLogoPath)) {
                    const pageWidth = doc.page.width;
                    const logoWidth = 80;
                    const logoHeight = 60;
                    const spacing = 50;
                    const totalLogosWidth = (logoWidth * 2) + spacing;
                    const startX = (pageWidth - totalLogosWidth) / 2;
                    
                    // Mae logo on the left
                    doc.image(logoPath, startX, doc.y, {
                        width: logoWidth,
                        height: logoHeight,
                        fit: [logoWidth, logoHeight]
                    });
                    
                    // La Fenice logo on the right
                    doc.image(lafeniceLogoPath, startX + logoWidth + spacing, doc.y, {
                        width: logoWidth,
                        height: logoHeight,
                        fit: [logoWidth, logoHeight]
                    });
                    
                    // Move down to accommodate logos
                    doc.y += logoHeight + 20;
                }
            } catch (logoError) {
                // If logos fail to load, continue without them
                console.warn('Could not load logos for PDF:', logoError.message);
            }

            doc.fontSize(20)
               .font('Helvetica-Bold')
               .text('RIEPILOGO ISCRIZIONE', { align: 'center' })
               .moveDown();

            doc.fontSize(16)
               .font('Helvetica-Bold')
               .text(eventName || 'Evento', { align: 'center' })
               .moveDown(2);

            // Event details
            doc.fontSize(14)
               .font('Helvetica-Bold')
               .text('DETTAGLI EVENTO', { underline: true })
               .moveDown();

            doc.fontSize(11)
               .font('Helvetica');

            if (registrationData.user_id) {
                doc.text(`ID Utente: ${registrationData.user_id}`);
            }
            


            if (registrationData.costo_totale_gruppo !== undefined) {
                doc.fontSize(14)
                   .font('Helvetica-Bold')
                   .text(`Costo totale gruppo: €${registrationData.costo_totale_gruppo.toFixed(2)}`)
                   .fontSize(11)
                   .font('Helvetica');
            }

            doc.moveDown(1.5);

            // Room grouping section
            doc.fontSize(16)
               .font('Helvetica-Bold')
               .text('COMPOSIZIONE CAMERA', { align: 'center' })
               .moveDown();

            // Get all people (capogruppo + guests)
            const allPeople = [{
                nome: registrationData.nome,
                cognome: registrationData.cognome,
                email: registrationData.email,
                telefono: registrationData.telefono || registrationData.cellulare,
                data_nascita: registrationData.data_nascita,
                codice_fiscale: registrationData.codice_fiscale,
                indirizzo: registrationData.indirizzo,
                isCapogruppo: true
            }];

            // Add guests
            const guests = registrationData.guests || registrationData.ospiti || [];
            guests.forEach(guest => {
                allPeople.push({
                    ...guest,
                    isCapogruppo: false
                });
            });

            // Create room assignments based on room counts
            const rooms = [];
            let personIndex = 0;

            // Single rooms (1 person each)
            for (let i = 0; i < (registrationData.camera_singola || 0); i++) {
                if (personIndex < allPeople.length) {
                    rooms.push({
                        type: 'Camera Singola',
                        people: [allPeople[personIndex]]
                    });
                    personIndex++;
                }
            }

            // Double rooms (2 people each)
            for (let i = 0; i < (registrationData.camera_doppia || 0); i++) {
                const roomPeople = [];
                for (let j = 0; j < 2 && personIndex < allPeople.length; j++) {
                    roomPeople.push(allPeople[personIndex]);
                    personIndex++;
                }
                rooms.push({
                    type: 'Camera Doppia',
                    people: roomPeople
                });
            }

            // Triple rooms (3 people each)
            for (let i = 0; i < (registrationData.camera_tripla || 0); i++) {
                const roomPeople = [];
                for (let j = 0; j < 3 && personIndex < allPeople.length; j++) {
                    roomPeople.push(allPeople[personIndex]);
                    personIndex++;
                }
                rooms.push({
                    type: 'Camera Tripla',
                    people: roomPeople
                });
            }

            // Quadruple rooms (4 people each)
            for (let i = 0; i < (registrationData.camera_quadrupla || 0); i++) {
                const roomPeople = [];
                for (let j = 0; j < 4 && personIndex < allPeople.length; j++) {
                    roomPeople.push(allPeople[personIndex]);
                    personIndex++;
                }
                rooms.push({
                    type: 'Camera Quadrupla',
                    people: roomPeople
                });
            }

            // If there are remaining people without rooms, create a default group
            if (personIndex < allPeople.length) {
                const remainingPeople = allPeople.slice(personIndex);
                rooms.push({
                    type: 'Gruppo',
                    number: 1,
                    people: remainingPeople
                });
            }

            // Helper function to check if we need a new page
            function checkPageBreak(requiredHeight = 100) {
                if (doc.y + requiredHeight > doc.page.height - 50) {
                    doc.addPage();
                    return true;
                }
                return false;
            }

            // Display each room
            rooms.forEach((room, roomIndex) => {
                // Check if we need a new page for the room header
                checkPageBreak(30);
                
                // Room header with background
                const y = doc.y;
                doc.rect(50, y - 5, doc.page.width - 100, 25)
                   .fillAndStroke('#1e40af', '#1e40af');

                doc.fontSize(14)
                   .font('Helvetica-Bold')
                   .fillColor('white')
                   .text(`${room.type}`, 60, y + 2);

                doc.fillColor('black').moveDown(0.5);

                // People in this room
                room.people.forEach((person, personIndex) => {
                    const isCapogruppo = person.isCapogruppo;
                    
                    // Calculate how much space we need for this person
                    let requiredHeight = 50; // Base height for name
                    if (person.data_nascita) requiredHeight += 15;
                    if (person.codice_fiscale) requiredHeight += 15;
                    if (person.indirizzo) requiredHeight += 15;
                    if (isCapogruppo && (person.email || person.telefono)) requiredHeight += 15;
                    
                    // Check if we need a new page for this person
                    checkPageBreak(requiredHeight + 20);
                    
                    // Person box - start position
                    const personStartY = doc.y;
                    
                    // Person details
                    doc.fontSize(12)
                       .font('Helvetica-Bold')
                       .fillColor(isCapogruppo ? '#1e40af' : '#374151')
                       .text(`${person.nome} ${person.cognome}${isCapogruppo ? ' (Partecipante)' : ''}`, 70, doc.y + 10);

                    doc.fontSize(10)
                       .font('Helvetica')
                       .fillColor('#6b7280');

                    doc.moveDown(0.8);
                    
                    // Store the current Y position for field rendering
                    let fieldY = doc.y;
                    
                    if (person.data_nascita) {
                        doc.text(`Data di nascita: ${person.data_nascita}`, 70, fieldY);
                        fieldY += 15;
                    }

                    // For capogruppo, add contact info on the right side
                    if (isCapogruppo) {
                        let contactY = doc.y;
                        if (person.email) {
                            doc.text(`Email: ${person.email}`, 300, contactY);
                            contactY += 15;
                        }
                        if (person.telefono) {
                            doc.text(`Telefono: ${person.telefono}`, 300, contactY);
                        }
                    }

                    // Move to the end of the person box
                    doc.y = Math.max(fieldY, doc.y) + 5;
                    
                    // Draw border around the person box after content is placed
                    const personEndY = doc.y;
                    const boxHeight = personEndY - personStartY;
                    doc.rect(60, personStartY, doc.page.width - 120, boxHeight)
                       .stroke('#e5e7eb');

                    doc.fillColor('black').moveDown(0.5);
                });

                doc.moveDown(0.5);
            });

            // Summary section
            doc.addPage();
            
            doc.fontSize(16)
               .font('Helvetica-Bold')
               .text('RIEPILOGO GENERALE', { align: 'center' })
               .moveDown();

            // Room summary
            doc.fontSize(14)
               .font('Helvetica-Bold')
               .text('Riepilogo Camere:', { underline: true })
               .moveDown();

            doc.fontSize(11)
               .font('Helvetica');

            if (registrationData.camera_singola > 0) {
                doc.text(`• ${registrationData.camera_singola} Camera Singola`);
            }
            if (registrationData.camera_doppia > 0) {
                doc.text(`• ${registrationData.camera_doppia} Camera Doppia`);
            }
            if (registrationData.camera_tripla > 0) {
                doc.text(`• ${registrationData.camera_tripla} Camera Tripla`);
            }
            if (registrationData.camera_quadrupla > 0) {
                doc.text(`• ${registrationData.camera_quadrupla} Camera Quadrupla`);
            }

            doc.moveDown();
            doc.text(`Totale persone: ${allPeople.length}`);
            
            if (registrationData.costo_totale_gruppo !== undefined) {
                doc.moveDown();
                doc.fontSize(16)
                   .font('Helvetica-Bold')
                   .text(`Costo totale: €${registrationData.costo_totale_gruppo.toFixed(2)}`, { align: 'center' });
            }

            // Billing information
            if (registrationData.ragione_sociale || (registrationData.dati_fatturazione && registrationData.dati_fatturazione.ragione_sociale)) {
                doc.moveDown(2);
                doc.fontSize(14)
                   .font('Helvetica-Bold')
                   .text('DATI FATTURAZIONE', { underline: true })
                   .moveDown();

                doc.fontSize(11)
                   .font('Helvetica');

                const billing = registrationData.dati_fatturazione || registrationData;
                
                if (billing.ragione_sociale) {
                    doc.text(`Ragione sociale: ${billing.ragione_sociale}`);
                }
                
                if (billing.partita_iva) {
                    doc.text(`Partita IVA: ${billing.partita_iva}`);
                }
                
                if (billing.codice_fiscale_azienda) {
                    doc.text(`Codice fiscale: ${billing.codice_fiscale_azienda}`);
                }
                
                if (billing.indirizzo_sede_legale) {
                    doc.text(`Indirizzo sede legale: ${billing.indirizzo_sede_legale}`);
                }
                
                if (billing.codice_sdi) {
                    doc.text(`Codice SDI: ${billing.codice_sdi}`);
                }
                
                if (billing.pec_azienda) {
                    doc.text(`PEC: ${billing.pec_azienda}`);
                }
            }

            // Footer
            doc.moveDown(3);
            doc.fontSize(10)
               .font('Helvetica')
               .fillColor('#6b7280')
               .text(`Documento generato automaticamente in data: ${new Date().toLocaleDateString('it-IT')}`, { align: 'center' });

            // Finalize the PDF
            doc.end();

        } catch (error) {
            reject(error);
        }
    });
}

module.exports = {
    generateRegistrationPDF
};