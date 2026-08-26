import './main.css';
import * as createwallet from './pages/createwallet';

function renderDapp(path, data) {
    if (path == "/") { createwallet.render(data); }
}

renderDapp("/");