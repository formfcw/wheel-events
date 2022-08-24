export default function (element, options = {}) {
    const {
        velocity = 1.5,
        wheelstopDelay = 250,
        wheelstopDelayMax = 500,
        maxFails = 3,
        preventVerticalDefault = true,
        preventHorizontalDefault = true,
        eventPrefix = 'wheel'
    } = options;

    let { wheelstopMaxVelocity = 0.1 } = options;
    wheelstopMaxVelocity = Math.min(wheelstopMaxVelocity, velocity);

    const wheelstopDelayOffset = wheelstopDelayMax - wheelstopDelay;

    let swipeable = true;

    let watchData = [];

    const triggerNames = [
        'scroll',
        'scrollstart',
        'scrollstop',
        'ghostscroll',
        'ghostscrollstart',
        'ghostscrollstop',
        'swipe',
    ];

    const resetTriggers = () => {
        const triggerValues = {};
        triggerNames.forEach(trigger => triggerValues[trigger] = false);
        return triggerValues;
    };

    const initAnalyseData = (delta) => ({
        delta: delta,
        sign: getSign(delta),
        speedUp: true,
        fails: 0,
        speed: 0,
        swiping: false,
        trigger: resetTriggers()
    });

    const getSign = (val) => val === 0 ? 0 : (val > 0 ? 1 : -1);


    const methods = {
        disableSwipe: () => swipeable = false,
        enableSwipe: () => swipeable = true,
        isSwipeable: () => swipeable,
    };


    const getDifferencesByAxis = (data, prevData, timeDelta) => {
        const deltaUnchanged = data.delta === prevData.delta;
        const sign = getSign(data.delta);
        let restart = false;
        let directionChange = false;

        if (deltaUnchanged) {
            data.speedUp = prevData.speedUp;
            data.fails = prevData.fails;
        } else {
            const signSum = sign + prevData.sign;
            const positiveSpeedUp = signSum > 0 && data.delta > prevData.delta;
            const negativeSpeedUp = signSum < 0 && data.delta < prevData.delta;

            directionChange = signSum === 0;
            const speedUp = directionChange || positiveSpeedUp || negativeSpeedUp;

            if (!directionChange && speedUp !== prevData.speedUp && prevData.fails < maxFails) {
                data.speedUp = prevData.speedUp;
                data.fails += prevData.fails + 1;
            }
            else {
                data.speedUp = speedUp;
                data.fails = 0;
                restart = !prevData.speedUp && data.speedUp !== prevData.speedUp;
            }
        }

        // if swiping and delta == 1, a restart could be possible, so set fails to max to check it next time
        if (
            prevData.swiping
            && (
                !directionChange
                && data.delta * sign === 1
                && prevData.delta * prevData.sign >= 1
            )
        ) {
            data.fails = maxFails;
        }

        data.sign = sign;
        data.speed = data.delta * data.sign / timeDelta;

        data.swiping = (prevData.swiping && !restart)
            || (swipeable && data.speedUp && data.speed > velocity);
        data.trigger.swipe = data.swiping && (!prevData.swiping || restart);

        data.trigger.scroll = data.speedUp && !data.swiping && (deltaUnchanged ? prevData.trigger.scroll : true);
        data.trigger.scrollstart = data.trigger.scroll && !prevData.trigger.scroll;
        data.trigger.scrollstop = !data.trigger.scroll && prevData.trigger.scroll;

        data.trigger.ghostscroll = !data.speedUp && !data.swiping && (deltaUnchanged ? prevData.trigger.ghostscroll : true);
        data.trigger.ghostscrollstart = data.trigger.ghostscroll && !prevData.trigger.ghostscroll;
        data.trigger.ghostscrollstop = !data.trigger.ghostscroll && prevData.trigger.ghostscroll;

        data.delayOffsetFact = data.trigger.scroll && data.speed < wheelstopMaxVelocity ? (wheelstopMaxVelocity - data.speed) / wheelstopMaxVelocity : 0;

        return data;
    };


    const checkTriggersByComparingAxis = (dataA, dataB) => {
        const aScrollsWhileBIsSwiping = dataB.swiping && (dataA.trigger.scroll || dataA.trigger.ghostscroll);
        const aScrollsWhileBIsGhostscrolling = dataA.trigger.scroll && dataB.trigger.ghostscroll;

        if (aScrollsWhileBIsSwiping || aScrollsWhileBIsGhostscrolling)
            dataA.trigger = resetTriggers();

        return dataA;
    };


    const getPreviousDataOrInitial = (watchLength) =>
        watchLength > 0
            ? watchData[watchLength - 1]
            : {
                timeStamp: 0,
                x: initAnalyseData(0),
                y: initAnalyseData(0)
            };


    const analyse = ({ deltaX, deltaY, timeStamp }) => {
        const watchLength = watchData.length;
        const prevData = getPreviousDataOrInitial(watchLength);
        const data = {
            timeStamp: timeStamp,
            x: initAnalyseData(deltaX),
            y: initAnalyseData(deltaY)
        };
        const timeDelta = timeStamp - prevData.timeStamp;

        if (watchLength > 1)
            watchData.shift();

        data.x = getDifferencesByAxis(data.x, prevData.x, timeDelta);
        data.y = getDifferencesByAxis(data.y, prevData.y, timeDelta);

        data.x = checkTriggersByComparingAxis(data.x, data.y);
        data.y = checkTriggersByComparingAxis(data.y, data.x);

        watchData.push(data);

        return watchData[watchData.length - 1];
    };


    const getParametersByAxis = (axis, data, prop) =>
        data[axis].trigger[prop] && data[axis].delta !== 0
            ? { delta: data[axis].delta, sign: data[axis].sign, speed: data[axis].speed }
            : { delta: 0, sign: 0, speed: 0 };


    const triggerIfPresent = (data, name) => {
        if (data.x.trigger[name] || data.y.trigger[name]) {
            const detail = {
                x: getParametersByAxis('x', data, name),
                y: getParametersByAxis('y', data, name)
            };
            element.dispatchEvent(new CustomEvent(`${eventPrefix}${name}`, { detail }));
        }
    };


    const getMaxWheelstopDelayOffset = (data) => {
        const offsetFact = data.y.delayOffsetFact > data.x.delayOffsetFact
            ? data.y.delayOffsetFact
            : data.x.delayOffsetFact;

        return wheelstopDelayOffset * offsetFact;
    };


    const preventDefaultBehaviour = ({ deltaX, deltaY }) => {
        // important to prevent history-back of browser – don’t scroll!
        const wheelTurnsVertical = Math.abs(deltaX) < Math.abs(deltaY);
        return (preventHorizontalDefault && preventVerticalDefault)
            || (preventVerticalDefault && wheelTurnsVertical)
            || (preventHorizontalDefault && !wheelTurnsVertical);
    };


    const onWheel = (e) => {
        const preventFromScrolling = preventDefaultBehaviour(e);

        if (preventFromScrolling)
            e.preventDefault();

        const analysedData = analyse(e);

        if (preventFromScrolling && !element.wheelIsActive)
            element.style.overflow = 'auto';

        triggerNames.forEach(name => triggerIfPresent(analysedData, name));

        if (!element.wheelIsActive) {
            element.wheelIsActive = true;
            element.dispatchEvent(new CustomEvent(`${eventPrefix}start`));
        }

        clearTimeout(element.wheelStopTimerId);
        element.wheelStopTimerId = setTimeout(function () {
            if (preventFromScrolling)
                element.style.overflow = 'hidden';
            element.dispatchEvent(new CustomEvent(`${eventPrefix}stop`));
            element.wheelIsActive = false;
            watchData = [];
        },
            wheelstopDelay + getMaxWheelstopDelayOffset(analysedData)
        );
    };

    element.removeEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('wheel', onWheel, { passive: false });

    return methods;
}