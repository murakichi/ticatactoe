import React from 'react';

type SkillButtonProps = {
    onClick: () => void;
    disabled?: boolean;
    hidden?: boolean;
    buttonText: string;
    paragraph: string;
    onHoverStart?: () => void;
    onHoverEnd?: () => void;
    locked?: boolean;
    onToggleLock?: () => void;
}

export const SkillButton = (props: SkillButtonProps) => {
    return <div style={{ height: '50px', maxWidth: '100px', display: 'inline-block', marginLeft: props.hidden ? 0 : '5px', marginRight: props.hidden ? 0 : '5px' }} hidden={props.hidden}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
            <button
                onClick={props.onClick}
                disabled={props.disabled}
                hidden={props.hidden}
                onMouseEnter={props.onHoverStart}
                onMouseLeave={props.onHoverEnd}
            >
                {props.buttonText}
            </button>
            {props.onToggleLock && !props.hidden && (
                <button
                    onClick={props.onToggleLock}
                    title={props.locked ? 'ロック解除' : 'ロック（シャッフルで固定）'}
                    style={{ fontSize: '12px', padding: '0 2px', cursor: 'pointer', background: props.locked ? '#ffe08a' : 'transparent', border: '1px solid #ccc' }}
                >
                    {props.locked ? '🔒' : '🔓'}
                </button>
            )}
        </div>
        <p style={{ margin: 0, fontSize: '10px' }} hidden={props.hidden}>
            {props.paragraph}
        </p>
    </div>
}