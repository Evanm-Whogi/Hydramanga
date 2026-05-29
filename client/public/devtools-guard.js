(function () {
  var REDIRECT = 'https://www.google.com';

  function redirect() {
    window.location.replace(REDIRECT);
  }

  document.addEventListener('keydown', function (event) {
    var key = event.key.toLowerCase();
    var mod = event.ctrlKey || event.metaKey;

    if (
      key === 'f12' ||
      (mod && event.shiftKey && 'ijck'.indexOf(key) !== -1) ||
      (mod && key === 'u') ||
      (event.metaKey && event.altKey && 'ijc'.indexOf(key) !== -1)
    ) {
      event.preventDefault();
      event.stopPropagation();
      redirect();
    }
  }, true);

  document.addEventListener('contextmenu', function (event) {
    if (/\/read(?:\/|$)/.test(window.location.pathname)) {
      event.preventDefault();
    }
  });

  function isDockedDevToolsOpen() {
    return (
      window.outerWidth - window.innerWidth > 160 ||
      window.outerHeight - window.innerHeight > 160
    );
  }

  function isDebuggerAttached() {
    var start = performance.now();
    try {
      Function('debugger')();
    } catch (_error) {}
    return performance.now() - start > 100;
  }

  var bait = new Image();
  Object.defineProperty(bait, 'id', {
    get: function () {
      redirect();
      return '';
    },
    configurable: true,
  });

  function probeConsole() {
    console.dir(bait);
  }

  function checkWorkerDebugger(callback) {
    if (typeof Worker === 'undefined') {
      callback(false);
      return;
    }

    var settled = false;
    var timeoutId = 0;
    var workerScript =
      "self.onmessage=function(e){if(e.data!=='ping')return;self.postMessage('ack');try{(function(){}).constructor('debugger')()}catch(_){debugger}self.postMessage('done')};";
    var worker;

    function finish(open) {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      worker.terminate();
      callback(open);
    }

    try {
      worker = new Worker(
        'data:text/javascript;base64,' + btoa(workerScript)
      );
    } catch (_error) {
      callback(false);
      return;
    }

    worker.onmessage = function (event) {
      if (event.data === 'ack') {
        timeoutId = setTimeout(function () {
          finish(true);
        }, 100);
        return;
      }

      if (event.data === 'done') {
        finish(false);
      }
    };

    worker.onerror = function () {
      finish(false);
    };

    worker.postMessage('ping');
  }

  function runChecks() {
    if (isDockedDevToolsOpen() || isDebuggerAttached()) {
      redirect();
      return;
    }

    checkWorkerDebugger(function (open) {
      if (open) redirect();
    });
  }

  function tick() {
    probeConsole();
    requestAnimationFrame(tick);
  }

  window.addEventListener('resize', function () {
    if (isDockedDevToolsOpen()) redirect();
  });

  requestAnimationFrame(tick);
  runChecks();
  setInterval(runChecks, 300);
})();
