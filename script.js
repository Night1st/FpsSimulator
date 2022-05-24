import './style.css'
import * as THREE from 'three'
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { Octree } from 'three/examples/jsm/math/Octree.js'
import { OctreeHelper } from 'three/examples/jsm/helpers/OctreeHelper.js'
import { Capsule } from 'three/examples/jsm/math/Capsule.js';
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js';
import { FiniteStateMachine, State } from './FiniteStateMachine';
import PlayerFSM from './PlayerFSM';

const clock = new THREE.Clock();

const scene = new THREE.Scene();
const backgroundLoader = new THREE.CubeTextureLoader();
const backgroundTexture = backgroundLoader.load([
    './posx.jpg',
    './negx.jpg',
    './posy.jpg',
    './negy.jpg',
    './posz.jpg',
    './negz.jpg',
]);
backgroundTexture.encoding = THREE.sRGBEncoding
scene.background = backgroundTexture

const camera = new THREE.PerspectiveCamera( 70, window.innerWidth / window.innerHeight, 0.1, 1000 );
camera.rotation.order = 'YXZ';

const fillLight1 = new THREE.HemisphereLight( 0x4488bb, 0x002244, 0.5 );
fillLight1.position.set( 2, 1, 1 );
scene.add( fillLight1 );

const directionalLight = new THREE.DirectionalLight( 0xffffff, 0.8 );
directionalLight.position.set( - 5, 25, - 1 );
directionalLight.castShadow = true;
directionalLight.shadow.camera.near = 0.01;
directionalLight.shadow.camera.far = 500;
directionalLight.shadow.camera.right = 30;
directionalLight.shadow.camera.left = - 30;
directionalLight.shadow.camera.top	= 30;
directionalLight.shadow.camera.bottom = - 30;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
directionalLight.shadow.radius = 4;
directionalLight.shadow.bias = - 0.00006;
scene.add( directionalLight );

const container = document.getElementById( 'container' );
const blocker = document.getElementById( 'blocker' );
const instructions = document.getElementById( 'instructions' );

const renderer = new THREE.WebGLRenderer( { antialias: true } );
renderer.setPixelRatio( window.devicePixelRatio );
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild( renderer.domElement );

const worldOctree = new Octree();

const playerCollider = new Capsule( new THREE.Vector3( 0, 1, 0 ), new THREE.Vector3( 0, 4, 0 ), 0.35 );
const playerVelocity = new THREE.Vector3();
const playerDirection = new THREE.Vector3();

let playerOnFloor = false;
let mouseTime = 0;
let raycaster = new THREE.Raycaster();

const material = new THREE.MeshNormalMaterial()
const coneGeometry = new THREE.ConeGeometry(1, 4, 8)

const sceneMeshes = []
const cubeObject = []
const keyStates = {}; 

class BasicCharacterControllerProxy {
    constructor(animations) {
      this._animations = animations;
    }
  
    get animations() {
      return this._animations;
    }
};

class BasicCharacterControllerInput {
    constructor() {
      this._Init();    
    }
  
    _Init() {
      this._keys = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        fire: false,
        reload: false,
      };
      document.addEventListener('keydown', (e) => this._onKeyDown(e), false);
      document.addEventListener('keyup', (e) => this._onKeyUp(e), false);
      document.addEventListener('mousedown', (e) =>this._onMouseDown(), false);
      document.addEventListener('mouseup', (e) => this. _onMouseUp(), false);
    }
  
    _onKeyDown(event) {
      switch (event.keyCode) {
        case 87: // w
          this._keys.forward = true;
          break;
        case 65: // a
          this._keys.left = true;
          break;
        case 83: // s
          this._keys.backward = true;
          break;
        case 68: // d
          this._keys.right = true;
          break;
        case 82: // r
          this._keys.reload = true;
          break;
      }
    }
  
    _onKeyUp(event) {
      switch(event.keyCode) {
        case 87: // w
          this._keys.forward = false;
          break;
        case 65: // a
          this._keys.left = false;
          break;
        case 83: // s
          this._keys.backward = false;
          break;
        case 68: // d
          this._keys.right = false;
          break;
        case 82: // r
          this._keys.reload = false;
          break;
        }
    }

    _onMouseDown() {
        this._keys.fire = true;
    }

    _onMouseUp() {
        this._keys.fire = false;
    }
}

const enemyCube = new THREE.Mesh(
    new THREE.BoxGeometry(6, 6, 6),
    new THREE.MeshPhongMaterial({color: 0x333333})
);

enemyCube.position.set(0, -4, -20)

scene.add(enemyCube)
cubeObject.push(enemyCube)

document.addEventListener( 'keydown', ( event ) => {

    keyStates[ event.code ] = true;

} );

document.addEventListener( 'keyup', ( event ) => {

    keyStates[ event.code ] = false;

} );

const control = new PointerLockControls(camera, renderer.domElement)

instructions.addEventListener( 'click', function () {

    control.lock();

} );

control.addEventListener( 'lock', function () {

    instructions.style.display = 'none';
    blocker.style.display = 'none';

} );

control.addEventListener( 'unlock', function () {

    blocker.style.display = 'block';
    instructions.style.display = '';

} );

let score = 0;
let hit = false;

document.addEventListener( 'mousedown', (event) => {

    const mouse = {
        x: (event.movementX / renderer.domElement.clientWidth),
        y: (event.movementY / renderer.domElement.clientHeight),
    }
    raycaster.setFromCamera(mouse, camera)

    const intersects = raycaster.intersectObjects(sceneMeshes, false)
    const bulletImpact = raycaster.intersectObjects(cubeObject, false)
    if (intersects.length > 0) {
        const n = new THREE.Vector3()
        n.copy((intersects[0].face).normal)
        n.transformDirection(intersects[0].object.matrixWorld)

        const cone = new THREE.Mesh(coneGeometry, material)

        cone.lookAt(n)
        cone.rotateX(Math.PI / 2)
        cone.position.copy(intersects[0].point)
        cone.position.addScaledVector(n, 0.1)

        scene.add(cone)
    }
    if (bulletImpact.length > 0) {
        const n = new THREE.Vector3()
        n.copy((bulletImpact[0].face).normal)
        n.transformDirection(bulletImpact[0].object.matrixWorld)
        hit = true;
        score += 1;
        console.log(score)
    }
})

document.body.addEventListener( 'mousemove', ( event ) => {

    if ( document.pointerLockElement === document.body ) {

        camera.rotation.y -= event.movementX / 500;
        camera.rotation.x -= event.movementY / 500;

    }

} );

window.addEventListener( 'resize', onWindowResize );

function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize( window.innerWidth, window.innerHeight );

}

function playerCollisions() {

    const result = worldOctree.capsuleIntersect( playerCollider );

    playerOnFloor = false;

    if ( result ) {

        playerOnFloor = result.normal.y > 0;
        if ( ! playerOnFloor ) {

            playerVelocity.addScaledVector( result.normal, - result.normal.dot( playerVelocity ) );
            
        }

        playerCollider.translate( result.normal.multiplyScalar( result.depth ) );

    }
}

function updatePlayer( deltaTime ) {

    let damping = Math.exp( - 4 * deltaTime ) - 1;

    if ( ! playerOnFloor ) {

        playerVelocity.y -= 40 * deltaTime;

        // small air resistance
        damping *= 0.1;

    }

    playerVelocity.addScaledVector( playerVelocity, damping );

    const deltaPosition = playerVelocity.clone().multiplyScalar( deltaTime );
    playerCollider.translate( deltaPosition );
    playerCollisions();

    camera.position.copy( playerCollider.end );

}

function getForwardVector() {

    camera.getWorldDirection( playerDirection );
    playerDirection.y = 0;
    playerDirection.normalize();

    return playerDirection;

}

function getSideVector() {

    camera.getWorldDirection( playerDirection );
    playerDirection.y = 0;
    playerDirection.normalize();
    playerDirection.cross( camera.up );

    return playerDirection;

}

const startingMinutes = 1
let time = startingMinutes * 60

let mixer;
let manager;
let target;
const animations = {}
const stateMachine = new PlayerFSM(new BasicCharacterControllerProxy(animations))
const input = new BasicCharacterControllerInput();

const loader = new FBXLoader();
loader.setPath('./hand/');
loader.load('rodidas.fbx', (fbx) => {
    fbx.scale.setScalar(0.001);
    fbx.position.set(0, -0.45, 0.45)
    fbx.traverse(c => {
    c.castShadow = true;
    scene.add(camera)
    camera.add(fbx)
    });
    target = fbx;
    mixer = new THREE.AnimationMixer(target);
    manager = new THREE.LoadingManager();
    manager.onLoad = () => {
    stateMachine.SetState('idle');
    };
    const _OnLoad = (animName, anim) => {
    const clip = anim.animations[0];
    const action = mixer.clipAction(clip);

    animations[animName] = {
        clip: clip,
        action: action,
        };
    };
    const loader = new FBXLoader(manager);
    loader.setPath('./hand/');
    loader.load('fire.fbx', (a) => { _OnLoad('fire', a); });
    loader.load('idle.fbx', (a) => { _OnLoad('idle', a); });
    loader.load('reload.fbx', (a) => { _OnLoad('reload', a); })
    console.log(animations)
})

function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min) + min);
  }

function respawnCubeIfHit() {
    if(hit) {
        enemyCube.position.set(getRandomInt(-100, 100), -4, -20)
        hit = false
    }
}

function controls( deltaTime ) {

    // gives a bit of air control
    const speedDelta = deltaTime * ( playerOnFloor ? 25 : 8 );

    if ( input._keys.forward ) {

        playerVelocity.add( getForwardVector().multiplyScalar( speedDelta ) );

    }

    if ( input._keys.backward ) {

        playerVelocity.add( getForwardVector().multiplyScalar( - speedDelta ) );

    }

    if ( input._keys.left ) {

        playerVelocity.add( getSideVector().multiplyScalar( - speedDelta ) );

    }

    if ( input._keys.right) {

        playerVelocity.add( getSideVector().multiplyScalar( speedDelta ) );

    }

    if ( playerOnFloor ) {

        if ( keyStates[ 'Space' ] ) {

            playerVelocity.y = 15;

        }

    }

}

const loader2 = new GLTFLoader().setPath( './gltf/' );

loader2.load( 'frozen.glb', ( gltf ) => {
    scene.add( gltf.scene );
    console.log(gltf.scene)
    worldOctree.fromGraphNode( gltf.scene );

    gltf.scene.traverse( child => {

        if ( child.isMesh ) {

            child.castShadow = true;
            child.receiveShadow = true;

            sceneMeshes.push(child)
        }

    } );

    const helper = new OctreeHelper( worldOctree );
    helper.visible = false;
    scene.add( helper );

    const gui = new GUI( { width: 200 } );
    gui.add( { debug: false }, 'debug' )
        .onChange( function ( value ) {

            helper.visible = value;

        } );

    animate();

} );

function animate() {
    requestAnimationFrame( animate );
    const deltaTime = Math.min( 0.05, clock.getDelta() )
    stateMachine.Update(deltaTime, input)
    ///checkForTarget()
    // we look for collisions in substeps to mitigate the risk of
    // an object traversing another too quickly for detection

        controls( deltaTime );

        updatePlayer( deltaTime );

        respawnCubeIfHit()

        //teleportPlayerIfOob();
    const distanceFromCamera = 3;  // 3 units
    const targetReach = new THREE.Vector3(0, 0, -distanceFromCamera);
    targetReach.applyMatrix4(camera.matrixWorld);    
    
    const moveSpeed = 4;  // units per second
    const distance = enemyCube.position.distanceTo(targetReach);

    if (distance > 0.1) {
        const amount = Math.min(moveSpeed * deltaTime, distance) / distance;
        enemyCube.position.lerp(targetReach, amount);
        enemyCube.material.color.set('green');
    } else {
        enemyCube.material.color.set('red');
        console.log('tagged!')
    }

    renderer.render( scene, camera );

    if(mixer) {
        mixer.update(deltaTime)
    }
}
