"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var webgl_basics_1 = require("./webgl-basics");
var linalg_1 = require("./linalg");
var corner_table_1 = require("./corner-table/corner-table");
var fs = require('fs');
var https = require('http');
var vertexShaderStringCode = fs.readFileSync(__dirname + './../shaders/vertex.glsl').toString();
var fragmentShaderrStringCode = fs.readFileSync(__dirname + './../shaders/fragment.glsl').toString();
initCanvas('canvas_id');
var resW;
var resH;
//==================================
function getRequest(url) {
    return new Promise(function (resolve, reject) {
        https.get(url, function (resp) {
            var data = '';
            // A chunk of data has been recieved.
            resp.on('data', function (chunk) {
                data += chunk;
            });
            // The whole response has been received. Print out the result.
            resp.on('end', function () {
                resolve(data);
            });
        }).on("error", function (err) {
            reject(err);
        });
    });
}
//========================
function initCanvas(canvasId) {
    var htmlCanvasElement = document.getElementById(canvasId);
    var href = window.location.href;
    var url = new URL(href);
    resW = 800;
    resH = 600;
    htmlCanvasElement.width = resW;
    htmlCanvasElement.height = resH;
    var webGL2RenderingContext = htmlCanvasElement.getContext("webgl2");
    if (!webGL2RenderingContext) {
        throw 'WebGL2 not supported.';
    }
    var vertexShader = webgl_basics_1.createShader(webGL2RenderingContext, webGL2RenderingContext.VERTEX_SHADER, vertexShaderStringCode);
    var fragmentShader = webgl_basics_1.createShader(webGL2RenderingContext, webGL2RenderingContext.FRAGMENT_SHADER, fragmentShaderrStringCode);
    var program = webgl_basics_1.createProgram(webGL2RenderingContext, vertexShader, fragmentShader);
    webGL2RenderingContext.viewport(0, 0, webGL2RenderingContext.canvas.width, webGL2RenderingContext.canvas.height);
    webGL2RenderingContext.clearColor(0, 0, 0, 0);
    webGL2RenderingContext.useProgram(program);
    var uniformLocations = {
        m: webGL2RenderingContext.getUniformLocation(program, "m"),
        v: webGL2RenderingContext.getUniformLocation(program, "v"),
        p: webGL2RenderingContext.getUniformLocation(program, "p"),
        lightPosition: webGL2RenderingContext.getUniformLocation(program, "lightPosition"),
        materialAmbient: webGL2RenderingContext.getUniformLocation(program, "materialAmbient"),
        materialDiffuse: webGL2RenderingContext.getUniformLocation(program, "materialDiffuse"),
        materialSpecular: webGL2RenderingContext.getUniformLocation(program, "materialSpecular"),
        materialShininess: webGL2RenderingContext.getUniformLocation(program, "materialShininess")
    };
    startDrawLoop(webGL2RenderingContext, uniformLocations);
}
function startDrawLoop(webGL2RenderingContext, uniformLocations) {
    var htmlCanvasElement = document.getElementById('canvas_id');
    genPositionsAndNormals()
        .then(function (info) {
        var data = info.buffer;
        var triangleCount = info.triangleCount;
        var loadInitialTime = new Date().getTime();
        var buffers = loadDataInGPU(webGL2RenderingContext, data);
        webGL2RenderingContext.bindVertexArray(buffers.vao);
        var loadEndTime = new Date().getTime();
        var loadTime = (loadEndTime - loadInitialTime) / 1000.0;
        var initialTime = new Date().getTime();
        var frameCount = 0;
        function loop() {
            var currentTime = new Date().getTime() - initialTime;
            draw(webGL2RenderingContext, uniformLocations, currentTime, triangleCount);
            window.requestAnimationFrame(loop);
        }
        loop();
    });
}
function draw(webGL2RenderingContext, uniformLocations, currentTime, triangleCount) {
    webGL2RenderingContext.clear(webGL2RenderingContext.COLOR_BUFFER_BIT);
    webGL2RenderingContext.enable(webGL2RenderingContext.DEPTH_TEST);
    webGL2RenderingContext.uniformMatrix4fv(uniformLocations.m, false, new Float32Array([Math.cos(currentTime / 1000), 0, Math.sin(currentTime / 1000), 0,
        0, 1, 0, 0,
        -Math.sin(currentTime / 1000), 0, Math.cos(currentTime / 1000), 0,
        0, 0, 0, 1]));
    webGL2RenderingContext.uniformMatrix4fv(uniformLocations.v, false, new Float32Array([1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, -2, 1]));
    webGL2RenderingContext.uniformMatrix4fv(uniformLocations.p, false, new Float32Array(webgl_basics_1.projectionMatrix(1.0, 1.0, 1.0, 20.0)));
    webGL2RenderingContext.uniform3f(uniformLocations.lightPosition, 0.0, 0.0, 0.0);
    webGL2RenderingContext.uniform3f(uniformLocations.materialAmbient, 0.3, 0.0, 0.0);
    webGL2RenderingContext.uniform3f(uniformLocations.materialDiffuse, 1.0, 0.0, 0.0);
    webGL2RenderingContext.uniform3f(uniformLocations.materialSpecular, 1.0, 1.0, 1.0);
    webGL2RenderingContext.uniform1f(uniformLocations.materialShininess, 24.0);
    var primitiveType = webGL2RenderingContext.TRIANGLES;
    var drawArrays_offset = 0;
    var count = 3 * triangleCount;
    webGL2RenderingContext.drawArrays(primitiveType, drawArrays_offset, count);
}
function genPositionsAndNormals() {
    var href = window.location.href;
    var url = new URL(href);
    var meshName = url.searchParams.get('mesh');
    var simplificationSteps = url.searchParams.get('steps');
    if (meshName === null) {
        meshName = "bunny";
    }
    if (simplificationSteps === null) {
        simplificationSteps = '0';
    }
    // return getRequest(`http://mesh-services.ianalbuquerque.com:8999/mesh/` + meshName)
    return getRequest("http://localhost:8999/mesh/" + meshName + "/" + simplificationSteps)
        .then(function (data) {
        JSON.parse(data);
        var compression = JSON.parse(data);
        var cornerTableStructure = new corner_table_1.CornerTable();
        cornerTableStructure.decompress(compression.delta, compression.clers.split(''));
        var cornerTable = cornerTableStructure.getData();
        // const cornerTable: { G: number[], V: number[], O: number[] } = JSON.parse(data) as { G: number[], V: number[], O: number[] };
        var buffer = [];
        var triangleCount = cornerTable.V.length / 3;
        var triangleLoss = 0;
        for (var i = 0; i < triangleCount; i++) {
            var corner1 = i * 3;
            var corner2 = (i * 3) + 1;
            var corner3 = (i * 3) + 2;
            if (cornerTable.O[corner1] == -1 ||
                cornerTable.O[corner2] == -1 ||
                cornerTable.O[corner3] == -1) {
                triangleLoss += 1;
                continue;
            }
            var vertex1 = cornerTable.V[corner1];
            var vertex2 = cornerTable.V[corner2];
            var vertex3 = cornerTable.V[corner3];
            var coordinates1 = new linalg_1.Vector3(cornerTable.G[vertex1 * 3 + 0], cornerTable.G[vertex1 * 3 + 1], cornerTable.G[vertex1 * 3 + 2]);
            var coordinates2 = new linalg_1.Vector3(cornerTable.G[vertex2 * 3 + 0], cornerTable.G[vertex2 * 3 + 1], cornerTable.G[vertex2 * 3 + 2]);
            var coordinates3 = new linalg_1.Vector3(cornerTable.G[vertex3 * 3 + 0], cornerTable.G[vertex3 * 3 + 1], cornerTable.G[vertex3 * 3 + 2]);
            var normal = linalg_1.normalFromTriangleVertices(coordinates1, coordinates2, coordinates3);
            [].push.apply(buffer, coordinates1.asArray()); // Syntax note: calls the push method for `buffer` for each element in `....asArray()`
            [].push.apply(buffer, normal.asArray());
            [].push.apply(buffer, coordinates2.asArray());
            [].push.apply(buffer, normal.asArray());
            [].push.apply(buffer, coordinates3.asArray());
            [].push.apply(buffer, normal.asArray());
        }
        console.log("Triangle Loss = " + triangleLoss);
        return { buffer: buffer, triangleCount: triangleCount - triangleLoss };
    });
}
function createDataBuffer(webGL2RenderingContext, vao, data) {
    var positionBuffer = webGL2RenderingContext.createBuffer();
    webGL2RenderingContext.bindVertexArray(vao);
    webGL2RenderingContext.bindBuffer(webGL2RenderingContext.ARRAY_BUFFER, positionBuffer);
    webGL2RenderingContext.bufferData(webGL2RenderingContext.ARRAY_BUFFER, new Float32Array(data), webGL2RenderingContext.STATIC_DRAW);
    webGL2RenderingContext.enableVertexAttribArray(0);
    webGL2RenderingContext.vertexAttribPointer(0, 3, // size
    webGL2RenderingContext.FLOAT, // type
    false, // normalize
    6 * 4, // stride
    0 * 4); //offset
    webGL2RenderingContext.enableVertexAttribArray(1);
    webGL2RenderingContext.vertexAttribPointer(1, 3, // size
    webGL2RenderingContext.FLOAT, // type
    false, // normalize
    6 * 4, // stride
    3 * 4); //offset                                            
    return positionBuffer;
}
function loadDataInGPU(webGL2RenderingContext, data) {
    var vao = webGL2RenderingContext.createVertexArray();
    var buffer = createDataBuffer(webGL2RenderingContext, vao, data);
    return { vao: vao, buffer: buffer };
}
// Encoding stuff
function ab2str(buf) {
    return String.fromCharCode.apply(null, new Uint8Array(buf));
}
function str2ab(str) {
    var buf = new ArrayBuffer(str.length * 1);
    var bufView = new Uint8Array(buf);
    for (var i = 0, strLen = str.length; i < strLen; i++) {
        bufView[i] = str.charCodeAt(i);
    }
    return buf;
}
//# sourceMappingURL=index.js.map