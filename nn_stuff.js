var canvases = [];
const NAME_LEN = 15;

var models = {};

function make_random_name() {
  var s = "qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM1234567890";
  var len = s.length;
  var res = "";

  for (var i = 0; i < NAME_LEN; i++) {
    res += s.charAt(Math.floor(Math.random() * len));
  }
  return res;
}

function create_canv(w, h) {
  let canv = document.createElement("canvas");
  canv.width = w;
  canv.height = h;
  canv.id = make_random_name();
  canv.hidden = true;
  canvases.push(canv);

  const ctx = canv.getContext("2d");
  ctx.scale(2, 2);
  console.log("create canv");
  document.body.appendChild(canv);
  return canv;
}

function find_contours(canv) {
  var ctx = canv.getContext("2d");
  var w = canv.width;
  var h = canv.height;

  var mnx = w,
    mny = h,
    mxx = 0,
    mxy = 0;

  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var data = ctx.getImageData(x, y, 1, 1).data[0];
      if (data > 0) {
        if (x < mnx) mnx = x;
        if (x > mxx) mxx = x;
        if (y < mny) mny = y;
        if (y > mxy) mxy = y;
      }
    }
  }

  return [mnx, mny, mxx, mxy];
}

function crop_and_center_image(canv, sz) {
  let w = canv.width;
  let h = canv.height;
  var nw, nh;

  if (w > h) {
    nh = (sz / w) * h;
    nw = sz;
    console.log(nw, nh);
  } else {
    nw = (sz / h) * w;
    nh = sz;
  }

  var cnv_resized = create_canv(nw, nh);
  var imgc = cnv_resized.getContext("2d");
  imgc.drawImage(canv, 0, 0, nw, nh);

  var iy = (sz - nh) / 2;
  var ix = (sz - nw) / 2;

  var new_image = create_canv(sz, sz);
  var nc = new_image.getContext("2d");
  nc.fillStyle = "black";
  nc.fillRect(0, 0, sz, sz);
  for (var x = 0; x < sz; x++) {
    for (var y = 0; y < sz; y++) {
      if (x >= ix && x < ix + nw && y >= iy && y < iy + nh) {
        var dat = imgc.getImageData(x - ix, y - iy, 1, 1);
        if (dat.data[0] != 0) nc.putImageData(dat, x, y);
      }
    }
  }

  return new_image;
}

async function predict(canv, model_name, models_addr) {
  var model;
  if (!models[model_name]) {
    model = await tf.loadLayersModel(
      models_addr + "/" + model_name + "/model.json"
    );
    models[model_name] = model;
  } else {
    model = models[model_name];
  }

  var arr = process_image(canv, 28);
  let tf_arr = tf.tensor2d(arr);
  tf_arr = tf_arr.reshape([-1, 28, 28, 1]);

  let mx = model.predict(tf_arr);
  console.log(mx);
  var res = Array.from(mx.dataSync())[0];

  return res;
}

function image_to_array(canv, sz) {
  var ctx = canv.getContext("2d");
  var arr = [];
  for (var i = 0; i < sz; i++) {
    var la = [];
    for (var j = 0; j < sz; j++) {
      var d = ctx.getImageData(j, i, 1, 1).data[0];
      if (d > 0) la.push(255);
      else {
        la.push(0);
      }
    }
    arr.push(la);
  }
  return arr;
}

function process_image(canv, size) {
  let contours = find_contours(canv);
  var cropped = create_canv(
    contours[2] - contours[0],
    contours[3] - contours[1]
  );
  var left = contours[0],
    top = contours[1],
    w = contours[2] - contours[0],
    h = contours[3] - contours[1];
  cropped
    .getContext("2d")
    .drawImage(canv, left, top, w + left, h + top, 0, 0, w + left, h + top);
  var centered = crop_and_center_image(cropped, size);
  return image_to_array(centered, size);
}

function clear_canvases() {
  for (var i = 0; i < canvases.length; i++) {
    document.body.removeChild(canvases[i]);
  }
  canvases = [];
}

function setDPI(canvas, dpi) {
  // Set up CSS size.
  canvas.style.width = canvas.style.width || canvas.width + "px";
  canvas.style.height = canvas.style.height || canvas.height + "px";

  // Get size information.
  var scaleFactor = dpi / 96;
  var width = parseFloat(canvas.style.width);
  var height = parseFloat(canvas.style.height);

  // Backup the canvas contents.
  var oldScale = canvas.width / width;
  var backupScale = scaleFactor / oldScale;
  var backup = canvas.cloneNode(false);
  backup.getContext("2d").drawImage(canvas, 0, 0);

  // Resize the canvas.
  var ctx = canvas.getContext("2d");
  canvas.width = Math.ceil(width * scaleFactor);
  canvas.height = Math.ceil(height * scaleFactor);

  // Redraw the canvas image and scale future draws.
  ctx.setTransform(backupScale, 0, 0, backupScale, 0, 0);
  ctx.drawImage(backup, 0, 0);
  ctx.setTransform(scaleFactor, 0, 0, scaleFactor, 0, 0);
}

function createPredictor(div, width, height) {
  let canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = width * 2;
  canvas.style.height = height * 2;
  canvas.id = make_random_name();

  var context = canvas.getContext("2d");
  //setDPI(canvas, 24);

  //context.scale(2, 2);
  console.log("create predict");
  var w = canvas.width;
  var h = canvas.height;
  context.fillStyle = "black";
  context.fillRect(0, 0, w, h);

  var mouse = { x: 0, y: 0 };
  var draw = false;

  canvas.addEventListener("pointerdown", function(e) {
    mouse.x = e.pageX - this.offsetLeft;
    mouse.y = e.pageY - this.offsetTop;
    draw = true;
  });
  canvas.addEventListener("pointermove", function(e) {
    if (draw == true) {
      mouse.x = e.pageX - this.offsetLeft;
      mouse.y = e.pageY - this.offsetTop;

      context.fillStyle = "white";
      context.beginPath();
      context.ellipse(mouse.x / 2, mouse.y / 2, 3, 3, 0, 0, 2 * Math.PI);
      context.fill();
    }
  });
  canvas.addEventListener("pointerup", function(e) {
    mouse.x = e.pageX - this.offsetLeft;
    mouse.y = e.pageY - this.offsetTop;
    draw = false;
  });

  canvases.push(canvas);
  div.appendChild(canvas);
  var obj = {};
  obj.main_canv = canvas;
  obj.canvases = [];
  obj.clear_canvas = function() {
    var ctx = this.main_canv.getContext("2d");
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, w, h);
  };
  obj.predict = function(model_name, models_addr) {
    return predict(this.main_canv, model_name, models_addr);
  };
  return obj;
}
