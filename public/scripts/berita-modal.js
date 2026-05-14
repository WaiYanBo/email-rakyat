(function(){
  const modal = document.getElementById('video-modal');
  const overlay = document.getElementById('modal-overlay');
  const closeBtn = document.getElementById('close-modal');
  const iframe = document.getElementById('modal-iframe');
  const spinner = document.getElementById('loading-spinner');

  if (!modal || !overlay || !closeBtn || !iframe || !spinner) {
    console.error('Required modal elements not found');
    return;
  }

  const openModal = (videoId, startTime = 0) => {
    if (!videoId) {
      console.error('Video ID is required');
      return;
    }

    const videoIdPattern = /^[a-zA-Z0-9_-]{11}$/;
    if (!videoIdPattern.test(videoId)) {
      console.error('Invalid video ID:', videoId);
      return;
    }

    const safeStartTime = Math.max(0, Math.floor(Number(startTime) || 0));
    const src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&start=${safeStartTime}&rel=0&modestbranding=1`;

    spinner.classList.remove('hidden');
    iframe.classList.add('opacity-0');

    iframe.setAttribute('src', src);
    modal.classList.remove('hidden');
  };

  iframe.addEventListener('load', () => {
    if (iframe.getAttribute('src')) {
      spinner.classList.add('hidden');
      iframe.classList.remove('opacity-0');
    }
  });

  document.querySelectorAll('.play-trigger').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const videoId = trigger.getAttribute('data-video');
      openModal(videoId);
    });
  });

  const closeModal = () => {
    iframe.classList.add('opacity-0');
    setTimeout(() => {
      modal.classList.add('hidden');
      iframe.setAttribute('src', '');
      spinner.classList.add('hidden');
    }, 200);
  };

  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
})();
