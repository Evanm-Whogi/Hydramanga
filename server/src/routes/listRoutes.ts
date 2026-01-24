import express, { RequestHandler } from 'express';
import { 
    getUserLists, 
    createList, 
    updateList, 
    deleteList, 
    getListItems, 
    addToList, 
    removeFromList,
    reorderLists 
} from '@/controllers/listController';

const router = express.Router();

// Get all user lists
router.get('/', getUserLists as RequestHandler);

// Create a new list
router.post('/', createList as RequestHandler);

// Reorder lists
router.post('/reorder', reorderLists as RequestHandler);

// Remove manga from any list (before /:id routes to avoid matching as ID)
router.delete('/items', removeFromList as RequestHandler);

// Get items in a specific list
router.get('/:id', getListItems as RequestHandler);

// Update a list (name, visibility, sort order)
router.put('/:id', updateList as RequestHandler);

// Delete a list
router.delete('/:id', deleteList as RequestHandler);

// Add manga to a specific list
router.post('/:id/items', addToList as RequestHandler);

export default router;
