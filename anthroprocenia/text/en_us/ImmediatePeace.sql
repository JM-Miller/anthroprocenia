UPDATE LocalizedText
SET Text = replace(Text,
    'for a minimum of 10 turns. After that point, either side can Propose Peace',
    'until peace is agreed. Either side can Propose Peace immediately')
WHERE Language = 'en_US'
    AND Tag = 'LOC_ADVICE_ANTIQUITY_MILITARY_DECLARING_WAR_MESSAGE';

UPDATE LocalizedText
SET Text = replace(Text, 'after ten turns of War', 'as soon as War begins')
WHERE Language = 'en_US'
    AND Tag = 'LOC_ADVICE_EXPLORATION_MILITARY_PEACE_DEALS_MESSAGE';
