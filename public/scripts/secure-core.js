// DIGITAL FORTRESS - SECURE CORE SCRIPTS
// Handles Security Modals ONLY (Mobile Menu is now handled in Navbar.astro)

document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. MOBILE MENU LOGIC REMOVED ---
    // We removed the code here because it was conflicting with Navbar.astro
    // resulting in the menu opening and closing instantly.

    // --- 2. MODAL LOGIC (Privacy, Terms, Security) ---
    const setupModal = (btnId, modalId, templateId) => {
        const modalBtn = document.getElementById(btnId);
        const modal = document.getElementById(modalId);
        const template = document.getElementById(templateId);
        
        if (modalBtn && modal) {
            // Open Modal
            modalBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (template && modal.children.length === 0) {
                    modal.appendChild(template.content.cloneNode(true));
                }
                modal.showModal();
                document.body.style.overflow = 'hidden'; // Lock background scroll
            });

            // Close Modal (Click Outside or Close Button)
            modal.addEventListener('click', (e) => {
                const dialogDimensions = modal.getBoundingClientRect();
                
                // Check if click is outside the box dimensions
                const isClickOutside = 
                    e.clientX < dialogDimensions.left ||
                    e.clientX > dialogDimensions.right ||
                    e.clientY < dialogDimensions.top ||
                    e.clientY > dialogDimensions.bottom;
                
                const isCloseBtn = e.target.classList.contains('close-modal');

                if (isClickOutside || isCloseBtn) {
                    modal.close();
                    document.body.style.overflow = ''; // Unlock background scroll
                }
            });
        }
    };

    // Initialize Modals
    setupModal('btn-privacy', 'modal-privacy', 'template-privacy');
    setupModal('btn-terms', 'modal-terms', 'template-terms');
    setupModal('btn-security', 'modal-security', 'template-security');

    console.log("Secure Core System: Online (Modals Only)");
});